import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useModulePerm } from "@/lib/permissions";
import { RequireModulePerm } from "@/components/RequireModulePerm";
import { useObraAtual } from "@/lib/obra-context.types";
import { uploadAnexo, getAnexoUrl, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, formatFileSize } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Pencil,
  Paperclip,
  Printer,
  PackageOpen,
  UserCheck,
  Undo2,
  ArrowRightLeft,
} from "lucide-react";
import { toast } from "sonner";
import { differenceInDays } from "date-fns";
import { safeParseISO } from "@/lib/utils";
import { InventoryImportExport } from "@/components/InventoryImportExport";
import { DataPagination, usePagination } from "@/components/DataPagination";

export const Route = createFileRoute("/_authenticated/ferramentas")({
  component: () => (
    <RequireModulePerm module="ferramentas">
      <FerramentasPage />
    </RequireModulePerm>
  ),
});

function FerramentasPage() {
  const qc = useQueryClient();
  const { obraId } = useObraAtual();
  const { data: user } = useCurrentUser();
  const perm = useModulePerm("ferramentas");
  const canEdit = perm.can_edit;
  const canDelete = perm.can_delete;
  const canImport = perm.can_import;

  const { data: ferramentas = [] } = useQuery({
    queryKey: ["ferramentas", obraId],
    enabled: perm.can_view,
    queryFn: async () => {
      let q = supabase.from("ferramentas").select("*, obra:obras(nome)").order("nome");
      if (obraId) q = q.eq("obra_id", obraId);
      return (await q).data ?? [];
    },
  });
  const { data: obras = [] } = useQuery({
    queryKey: ["obras-min-fer"],
    enabled: perm.can_view,
    queryFn: async () => (await supabase.from("obras").select("id, nome").order("nome")).data ?? [],
  });
  const { data: funcionarios = [] } = useQuery({
    queryKey: ["func-min"],
    enabled: perm.can_view,
    queryFn: async () =>
      (await supabase.from("funcionarios").select("id, nome").eq("ativo", true).order("nome"))
        .data ?? [],
  });
  const { data: emprestimos = [] } = useQuery({
    queryKey: ["emprestimos"],
    enabled: perm.can_view,
    queryFn: async () =>
      (
        await supabase
          .from("ferramenta_emprestimos")
          .select("*, ferramenta:ferramentas(nome), funcionario:funcionarios(nome)")
          .order("created_at", { ascending: false })
      ).data ?? [],
  });
  const { data: transferencias = [] } = useQuery({
    queryKey: ["ferramenta-transferencias"],
    enabled: perm.can_view,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("ferramenta_transferencias" as any)
          .select(
            "*, ferramenta:ferramentas(nome, codigo), origem:obras!ferramenta_transferencias_obra_origem_id_fkey(nome), destino:obras!ferramenta_transferencias_obra_destino_id_fkey(nome)",
          )
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        return (data as any[]) ?? [];
      } catch {
        // Tabela ainda sem migration aplicada: histórico vazio, transferência direta continua funcionando
        return [];
      }
    },
  });

  const [openF, setOpenF] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [openE, setOpenE] = useState(false);
  const [fF, setFF] = useState<any>({ estado: "disponivel" });
  const [fE, setFE] = useState<any>({});
  const [uploading, setUploading] = useState(false);

  // ---- Transferência entre obras (uma ou várias ferramentas) ----
  const [openT, setOpenT] = useState(false);
  const [transfOrigem, setTransfOrigem] = useState("all");
  const [transfBusca, setTransfBusca] = useState("");
  const [transfIds, setTransfIds] = useState<string[]>([]);
  const [transfDestino, setTransfDestino] = useState("");
  const [transfMotivo, setTransfMotivo] = useState("");
  // Seleção no catálogo para atalho de transferência
  const [selCatalogo, setSelCatalogo] = useState<string[]>([]);

  // Filtros do inventário — valem para a tabela e para impressão/PDF
  const [buscaFer, setBuscaFer] = useState("");
  const [estadoInv, setEstadoInv] = useState("all");
  const [obraInvFer, setObraInvFer] = useState("all");
  const [manutInv, setManutInv] = useState("all");

  const ferramentasFiltradas = useMemo(() => {
    const q = buscaFer.trim().toLowerCase();
    const hoje = new Date();
    return (ferramentas as any[]).filter((f: any) => {
      if (estadoInv !== "all" && String(f.estado ?? "") !== estadoInv) return false;
      if (obraInvFer !== "all") {
        if (obraInvFer === "__geral") {
          if ((f as any).obra_id) return false;
        } else if ((f as any).obra_id !== obraInvFer) return false;
      }
      if (manutInv !== "all") {
        const dias = f.proxima_manutencao
          ? differenceInDays(safeParseISO(f.proxima_manutencao), hoje)
          : null;
        if (manutInv === "sem_data" && f.proxima_manutencao) return false;
        if (manutInv === "vencida" && !(dias !== null && dias < 0)) return false;
        if (manutInv === "prox_15" && !(dias !== null && dias >= 0 && dias <= 15)) return false;
        if (manutInv === "com_data" && !f.proxima_manutencao) return false;
      }
      if (!q) return true;
      return (
        (f.nome ?? "").toLowerCase().includes(q) ||
        (f.codigo ?? "").toLowerCase().includes(q)
      );
    });
  }, [ferramentas, buscaFer, estadoInv, obraInvFer, manutInv]);

  const pagFerramentas = usePagination(ferramentasFiltradas, {
    key: "ferramentas",
    resetKey: `${buscaFer}|${estadoInv}|${obraInvFer}|${manutInv}`,
  });

  const exportInventarioFerSpec = useMemo(() => {
    const headers = ["Nome", "Código", "Estado", "Obra", "Próx. manutenção", "Descrição"];
    const rows = ferramentasFiltradas.map((f: any) => [
      f.nome ?? "",
      f.codigo ?? "",
      f.estado ?? "",
      f.obra?.nome ?? "",
      f.proxima_manutencao ?? "",
      (f.descricao ?? "").replace(/\s+/g, " ").slice(0, 120),
    ]);
    const estadoTxt = estadoInv === "all" ? "Todos os estados" : estadoInv;
    const obraTxt =
      obraInvFer === "all"
        ? "Todas as obras"
        : obraInvFer === "__geral"
          ? "Geral (sem obra)"
          : ((obras as any[]).find((o: any) => o.id === obraInvFer)?.nome ?? obraInvFer);
    const manutTxt: Record<string, string> = {
      all: "Todas",
      vencida: "Manutenção vencida",
      prox_15: "Manutenção próximos 15 dias",
      sem_data: "Sem data de manutenção",
      com_data: "Com data definida",
    };
    const parts: string[] = [];
    if (buscaFer.trim()) parts.push(`Busca: "${buscaFer.trim()}"`);
    parts.push(`Estado/Tipo: ${estadoTxt}`);
    parts.push(`Obra: ${obraTxt}`);
    parts.push(`Manutenção: ${manutTxt[manutInv] ?? manutInv}`);
    parts.push(`${ferramentasFiltradas.length} item(ns) — cada ferramenta = 1 unidade`);
    return {
      headers,
      rows,
      filenameBase: `inventario-ferramentas-${new Date().toISOString().slice(0, 10)}`,
      pdfTitle: "Inventário de ferramentas",
      pdfSubtitle: "Filtros — " + parts.join(" | "),
    };
  }, [ferramentasFiltradas, obras, buscaFer, estadoInv, obraInvFer, manutInv]);

  const openNewF = () => {
    setEditing(null);
    setFF({ estado: "disponivel" });
    setOpenF(true);
  };
  const openEditF = (f: any) => {
    setEditing(f);
    setFF({ ...f });
    setOpenF(true);
  };

  const saveF = useMutation({
    mutationFn: async () => {
      const payload = { ...fF };
      delete payload.obra;
      Object.keys(payload).forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      if (editing) {
        const { error } = await supabase.from("ferramentas").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ferramentas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Atualizada" : "Criada");
      qc.invalidateQueries({ queryKey: ["ferramentas"] });
      qc.invalidateQueries({ queryKey: ["dash-ferramentas"] });
      setOpenF(false);
      setEditing(null);
      setFF({ estado: "disponivel" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeF = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ferramentas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ferramentas"] });
      qc.invalidateQueries({ queryKey: ["dash-ferramentas"] });
    },
  });

  const [editingEmp, setEditingEmp] = useState<any>(null);
  // Filtros / UI da ficha
  const [buscaEmp, setBuscaEmp] = useState("");
  const [filtroFicha, setFiltroFicha] = useState("abertas");
  const [buscaFerrLote, setBuscaFerrLote] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [fichaAlvo, setFichaAlvo] = useState<any>(null);
  const [addFerrId, setAddFerrId] = useState("");

  const openEditEmp = (e: any) => {
    setEditingEmp(e);
    setFE({
      ferramenta_id: e.ferramenta_id,
      ferramenta_ids: [e.ferramenta_id],
      funcionario_id: e.funcionario_id,
      data_emprestimo: e.data_emprestimo ?? "",
      prevista_devolucao: e.prevista_devolucao ?? "",
      data_devolucao: e.data_devolucao ?? "",
      anexo_url: e.anexo_url ?? "",
      observacoes: e.observacoes ?? "",
    });
    setOpenE(true);
  };

  const openNewLote = () => {
    setEditingEmp(null);
    setFE({
      funcionario_id: "",
      data_emprestimo: new Date().toISOString().slice(0, 10),
      prevista_devolucao: "",
      observacoes: "",
      anexo_url: "",
      ferramenta_ids: [],
    });
    setBuscaFerrLote("");
    setOpenE(true);
  };

  const toggleFerrLote = (id: string) => {
    setFE((p: any) => {
      const cur: string[] = p.ferramenta_ids ?? [];
      return { ...p, ferramenta_ids: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  };

  // Agrupa empréstimos em fichas por colaborador.
  // Usa ficha_id quando existir (migration nova); senão agrupa por
  // colaborador + data + minuto de criação (lote inserido junto cai na mesma ficha).
  const fichas = useMemo(() => {
    const map = new Map<string, any>();
    for (const e of emprestimos as any[]) {
      const key = (e as any).ficha_id
        ? `ficha:${(e as any).ficha_id}`
        : `lote:${e.funcionario_id ?? "?"}|${e.data_emprestimo ?? "?"}|${String(e.created_at ?? "").slice(0, 16)}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          ficha_id: (e as any).ficha_id ?? null,
          funcionario_id: e.funcionario_id,
          funcionario_nome: e.funcionario?.nome ?? "—",
          data_emprestimo: e.data_emprestimo,
          prevista_devolucao: e.prevista_devolucao,
          observacoes: e.observacoes,
          anexo_url: e.anexo_url,
          created_at: e.created_at,
          itens: [],
        });
      }
      const f = map.get(key);
      f.itens.push(e);
      // mantém a previsão mais relevante / anexo mais recente
      if (!f.prevista_devolucao && e.prevista_devolucao) f.prevista_devolucao = e.prevista_devolucao;
      if (e.anexo_url && !f.anexo_url) f.anexo_url = e.anexo_url;
    }
    const arr = [...map.values()].map((f: any) => {
      const abertas = f.itens.filter((i: any) => !i.data_devolucao);
      const devolvidas = f.itens.filter((i: any) => !!i.data_devolucao);
      return {
        ...f,
        abertas: abertas.length,
        devolvidas: devolvidas.length,
        total: f.itens.length,
        status: abertas.length === 0 ? "devolvida" : devolvidas.length === 0 ? "aberta" : "parcial",
        itens: [...f.itens].sort((a: any, b: any) =>
          String(a.ferramenta?.nome ?? "").localeCompare(String(b.ferramenta?.nome ?? "")),
        ),
      };
    });
    arr.sort((a: any, b: any) => String(b.data_emprestimo ?? "").localeCompare(String(a.data_emprestimo ?? "")));
    const q = buscaEmp.trim().toLowerCase();
    return arr.filter((f: any) => {
      if (filtroFicha === "abertas" && f.abertas === 0) return false;
      if (filtroFicha === "devolvidas" && f.abertas !== 0) return false;
      if (!q) return true;
      return (
        (f.funcionario_nome ?? "").toLowerCase().includes(q) ||
        f.itens.some((i: any) => (i.ferramenta?.nome ?? "").toLowerCase().includes(q))
      );
    });
  }, [emprestimos, buscaEmp, filtroFicha]);

  const pagFichas = usePagination(fichas, {
    key: "ferramentas-fichas",
    resetKey: `${buscaEmp}|${filtroFicha}`,
  });

  const ferramentasDisponiveis = useMemo(
    () => (ferramentas as any[]).filter((f: any) => f.estado === "disponivel"),
    [ferramentas],
  );

  const ferramentasLoteFiltradas = useMemo(() => {
    const q = buscaFerrLote.trim().toLowerCase();
    if (!q) return ferramentasDisponiveis;
    return ferramentasDisponiveis.filter(
      (f: any) =>
        (f.nome ?? "").toLowerCase().includes(q) || (f.codigo ?? "").toLowerCase().includes(q),
    );
  }, [ferramentasDisponiveis, buscaFerrLote]);

  // ---- Transferência: lista filtrada por obra de origem + busca ----
  const ferramentasTransferiveis = useMemo(() => {
    const q = transfBusca.trim().toLowerCase();
    return (ferramentas as any[]).filter((f: any) => {
      if (transfOrigem !== "all") {
        if (transfOrigem === "__geral") {
          if ((f as any).obra_id) return false;
        } else if ((f as any).obra_id !== transfOrigem) return false;
      }
      if (!q) return true;
      return (
        (f.nome ?? "").toLowerCase().includes(q) ||
        (f.codigo ?? "").toLowerCase().includes(q)
      );
    });
  }, [ferramentas, transfOrigem, transfBusca]);

  const toggleTransfId = (id: string) => {
    setTransfIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const toggleSelCatalogo = (id: string) => {
    setSelCatalogo((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const openTransferDialog = (ids?: string[]) => {
    const alvo = ids ?? selCatalogo;
    if (alvo.length === 0) {
      toast.error("Selecione ao menos uma ferramenta.");
      return;
    }
    setTransfIds(alvo);
    // Pré-preenche destino vazio e abre o dialog
    setTransfDestino("");
    setOpenT(true);
  };

  const transferir = useMutation({
    mutationFn: async () => {
      const ids = transfIds;
      if (ids.length === 0) throw new Error("Selecione ao menos uma ferramenta.");
      if (!transfDestino) throw new Error("Selecione a obra de destino.");
      const destino: string | null = transfDestino === "__geral" ? null : transfDestino;
      const mapa = new Map((ferramentas as any[]).map((f: any) => [f.id, f]));
      const itens = ids.map((id) => mapa.get(id)).filter(Boolean);
      if (itens.length === 0) throw new Error("Ferramentas não encontradas.");
      const jaNoDestino = itens.filter((f: any) => (f.obra_id ?? null) === destino);
      if (jaNoDestino.length === itens.length) throw new Error("Todas já estão nesta obra/destino.");
      // Bloqueia itens emprestados para evitar divergência com a ficha do colaborador
      const emprestadas = itens.filter((f: any) => f.estado === "emprestada");
      if (emprestadas.length > 0) {
        throw new Error(
          `${emprestadas.length} item(ns) emprestado(s) — devolva antes de transferir (${emprestadas.slice(0, 3).map((f: any) => f.nome).join(", ")}${emprestadas.length > 3 ? "…" : ""}).`,
        );
      }
      const { error: upErr } = await supabase
        .from("ferramentas")
        .update({ obra_id: destino })
        .in("id", ids);
      if (upErr) throw upErr;
      // Histórico (não bloqueia se a migration ainda não foi aplicada)
      try {
        const lote_id = crypto.randomUUID();
        const rows = itens.map((f: any) => ({
          lote_id,
          ferramenta_id: f.id,
          obra_origem_id: f.obra_id ?? null,
          obra_destino_id: destino,
          motivo: transfMotivo || null,
          solicitado_por: user?.id ?? null,
        }));
        const { error: hErr } = await supabase
          .from("ferramenta_transferencias" as any)
          .insert(rows as any);
        if (hErr) throw hErr;
      } catch (e: any) {
        // Se for falta da tabela/coluna, ignora (transferência já foi efetivada)
        if (!/ferramenta_transferencias|column|relation|schema cache/i.test(String(e?.message ?? e))) throw e;
      }
    },
    onSuccess: () => {
      toast.success(`Transferência concluída (${transfIds.length} item(ns))`);
      qc.invalidateQueries({ queryKey: ["ferramentas"] });
      qc.invalidateQueries({ queryKey: ["ferramenta-transferencias"] });
      qc.invalidateQueries({ queryKey: ["dash-ferramentas"] });
      setOpenT(false);
      setTransfIds([]);
      setSelCatalogo([]);
      setTransfMotivo("");
      setTransfDestino("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const lotesTransferencia = useMemo(() => {
    const map = new Map<string, any>();
    for (const t of transferencias as any[]) {
      const key = t.lote_id ?? t.id;
      if (!map.has(key)) {
        map.set(key, {
          key,
          lote_id: t.lote_id ?? t.id,
          created_at: t.created_at,
          obra_origem_id: t.obra_origem_id,
          obra_destino_id: t.obra_destino_id,
          origem_nome: t.origem?.nome ?? "Geral",
          destino_nome: t.destino?.nome ?? "Geral",
          motivo: t.motivo,
          itens: [],
        });
      }
      map.get(key).itens.push(t);
    }
    const arr = [...map.values()];
    arr.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    return arr.slice(0, 100);
  }, [transferencias]);

  const pagLotesTransf = usePagination(lotesTransferencia, {
    key: "ferramentas-transf",
    resetKey: String((transferencias as any[]).length),
  });

  const removeLoteTransferencia = useMutation({
    mutationFn: async (lote: any) => {
      const ids = lote.itens.map((i: any) => i.id);
      const { error } = await supabase
        .from("ferramenta_transferencias" as any)
        .delete()
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Histórico de transferência excluído");
      qc.invalidateQueries({ queryKey: ["ferramenta-transferencias"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveEmprestimo = useMutation({
    mutationFn: async () => {
      // Edição de um item específico da ficha
      if (editingEmp) {
        const payload = {
          ferramenta_id: fE.ferramenta_id,
          funcionario_id: fE.funcionario_id || null,
          data_emprestimo: fE.data_emprestimo || new Date().toISOString().slice(0, 10),
          prevista_devolucao: fE.prevista_devolucao || null,
          data_devolucao: fE.data_devolucao || null,
          anexo_url: fE.anexo_url || null,
          observacoes: fE.observacoes || null,
        };
        const { error } = await supabase.from("ferramenta_emprestimos").update(payload).eq("id", editingEmp.id);
        if (error) throw error;
        if (fE.data_devolucao) {
          await supabase.from("ferramentas").update({ estado: "disponivel" }).eq("id", fE.ferramenta_id);
        } else {
          await supabase.from("ferramentas").update({ estado: "emprestada" }).eq("id", fE.ferramenta_id);
        }
        return;
      }
      // Novo empréstimo em lote: várias ferramentas, uma ficha por colaborador
      const ids: string[] = fE.ferramenta_ids ?? [];
      if (!fE.funcionario_id) throw new Error("Selecione o colaborador.");
      if (ids.length === 0) throw new Error("Selecione ao menos uma ferramenta.");
      const ficha_id = crypto.randomUUID();
      const base = {
        funcionario_id: fE.funcionario_id,
        data_emprestimo: fE.data_emprestimo || new Date().toISOString().slice(0, 10),
        prevista_devolucao: fE.prevista_devolucao || null,
        anexo_url: fE.anexo_url || null,
        observacoes: fE.observacoes || null,
        created_by: user?.id,
      };
      const rows = ids.map((fid) => ({ ...base, ferramenta_id: fid, ficha_id }));
      let { error } = await supabase.from("ferramenta_emprestimos").insert(rows as any);
      if (error && /ficha_id|column/i.test(error.message)) {
        // Banco ainda sem a migration: insere sem ficha_id (agrupa por minuto de criação)
        const fallback = ids.map((fid) => ({ ...base, ferramenta_id: fid }));
        const r2 = await supabase.from("ferramenta_emprestimos").insert(fallback as any);
        if (r2.error) throw r2.error;
      } else if (error) {
        throw error;
      }
      const { error: e2 } = await supabase.from("ferramentas").update({ estado: "emprestada" }).in("id", ids);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success(editingEmp ? "Empréstimo atualizado" : `Ficha registrada (${(fE.ferramenta_ids ?? []).length} item(ns))`);
      qc.invalidateQueries({ queryKey: ["emprestimos"] });
      qc.invalidateQueries({ queryKey: ["ferramentas"] });
      qc.invalidateQueries({ queryKey: ["dash-emprestimos"] });
      qc.invalidateQueries({ queryKey: ["dash-ferramentas"] });
      setOpenE(false);
      setEditingEmp(null);
      setFE({});
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeEmprestimo = useMutation({
    mutationFn: async (emp: any) => {
      const { error } = await supabase.from("ferramenta_emprestimos").delete().eq("id", emp.id);
      if (error) throw error;
      if (!emp.data_devolucao) {
        await supabase.from("ferramentas").update({ estado: "disponivel" }).eq("id", emp.ferramenta_id);
      }
    },
    onSuccess: () => {
      toast.success("Item removido da ficha");
      qc.invalidateQueries({ queryKey: ["emprestimos"] });
      qc.invalidateQueries({ queryKey: ["ferramentas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeFicha = useMutation({
    mutationFn: async (ficha: any) => {
      const ids = ficha.itens.map((i: any) => i.id);
      const ferrIds = ficha.itens.filter((i: any) => !i.data_devolucao).map((i: any) => i.ferramenta_id);
      const { error } = await supabase.from("ferramenta_emprestimos").delete().in("id", ids);
      if (error) throw error;
      if (ferrIds.length) {
        await supabase.from("ferramentas").update({ estado: "disponivel" }).in("id", ferrIds);
      }
    },
    onSuccess: () => {
      toast.success("Ficha excluída");
      qc.invalidateQueries({ queryKey: ["emprestimos"] });
      qc.invalidateQueries({ queryKey: ["ferramentas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const emprestar = saveEmprestimo;

  const devolver = useMutation({
    mutationFn: async (e: any) => {
      const { error } = await supabase
        .from("ferramenta_emprestimos")
        .update({ data_devolucao: new Date().toISOString().slice(0, 10) })
        .eq("id", e.id);
      if (error) throw error;
      await supabase.from("ferramentas").update({ estado: "disponivel" }).eq("id", e.ferramenta_id);
    },
    onSuccess: () => {
      toast.success("Ferramenta devolvida");
      qc.invalidateQueries({ queryKey: ["emprestimos"] });
      qc.invalidateQueries({ queryKey: ["ferramentas"] });
      qc.invalidateQueries({ queryKey: ["dash-emprestimos"] });
      qc.invalidateQueries({ queryKey: ["dash-ferramentas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const devolverFicha = useMutation({
    mutationFn: async (ficha: any) => {
      const abertos = ficha.itens.filter((i: any) => !i.data_devolucao);
      if (abertos.length === 0) throw new Error("Ficha já devolvida.");
      const hoje = new Date().toISOString().slice(0, 10);
      const { error } = await supabase
        .from("ferramenta_emprestimos")
        .update({ data_devolucao: hoje })
        .in("id", abertos.map((i: any) => i.id));
      if (error) throw error;
      await supabase
        .from("ferramentas")
        .update({ estado: "disponivel" })
        .in("id", abertos.map((i: any) => i.ferramenta_id));
    },
    onSuccess: (_d, ficha: any) => {
      toast.success(`Ficha devolvida (${ficha.abertas} item(ns))`);
      qc.invalidateQueries({ queryKey: ["emprestimos"] });
      qc.invalidateQueries({ queryKey: ["ferramentas"] });
      qc.invalidateQueries({ queryKey: ["dash-emprestimos"] });
      qc.invalidateQueries({ queryKey: ["dash-ferramentas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addNaFicha = useMutation({
    mutationFn: async () => {
      if (!fichaAlvo || !addFerrId) throw new Error("Selecione a ferramenta.");
      const payload: any = {
        ferramenta_id: addFerrId,
        funcionario_id: fichaAlvo.funcionario_id,
        data_emprestimo: fichaAlvo.data_emprestimo,
        prevista_devolucao: fichaAlvo.prevista_devolucao ?? null,
        observacoes: fichaAlvo.observacoes ?? null,
        anexo_url: fichaAlvo.anexo_url ?? null,
        created_by: user?.id,
      };
      if (fichaAlvo.ficha_id) payload.ficha_id = fichaAlvo.ficha_id;
      const { error } = await supabase.from("ferramenta_emprestimos").insert(payload);
      if (error) throw error;
      const { error: e2 } = await supabase.from("ferramentas").update({ estado: "emprestada" }).eq("id", addFerrId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Ferramenta adicionada à ficha");
      qc.invalidateQueries({ queryKey: ["emprestimos"] });
      qc.invalidateQueries({ queryKey: ["ferramentas"] });
      setOpenAdd(false);
      setFichaAlvo(null);
      setAddFerrId("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const imprimirFicha = async (ficha: any) => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Ficha de empréstimo de ferramentas", 14, 16);
    doc.setFontSize(10);
    doc.text(`Colaborador: ${ficha.funcionario_nome}`, 14, 24);
    doc.text(
      `Empréstimo: ${ficha.data_emprestimo ?? "—"}   Previsão: ${ficha.prevista_devolucao ?? "—"}   Itens: ${ficha.total} (abertos: ${ficha.abertas})`,
      14,
      30,
    );
    if (ficha.observacoes) {
      const lines = doc.splitTextToSize(`Obs.: ${ficha.observacoes}`, 180);
      doc.text(lines, 14, 36);
    }
    autoTable(doc, {
      head: [["Ferramenta", "Empréstimo", "Previsão", "Devolução", "Situação"]],
      body: ficha.itens.map((i: any) => [
        i.ferramenta?.nome ?? "—",
        i.data_emprestimo ?? "—",
        i.prevista_devolucao ?? "—",
        i.data_devolucao ?? "em aberto",
        i.data_devolucao ? "devolvida" : "em posse",
      ]),
      startY: ficha.observacoes ? 44 : 34,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 58, 95] },
    });
    const y = (doc as any).lastAutoTable.finalY + 16;
    doc.setFontSize(10);
    doc.text("Assinatura do colaborador: ________________________________", 14, y);
    doc.text("Responsável pela entrega: ________________________________", 14, y + 10);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, y + 18);
    doc.save(`ficha-${(ficha.funcionario_nome ?? "colaborador").toLowerCase().replace(/\s+/g, "-")}-${ficha.data_emprestimo ?? "sem-data"}.pdf`);
  };

  const onUpload = async (file: File) => {
    try {
      setUploading(true);
      const path = await uploadAnexo(file, "ferramentas");
      setFE((p: any) => ({ ...p, anexo_url: path }));
      toast.success("Anexo enviado");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const openAnexo = async (path: string) => {
    const url = await getAnexoUrl(path);
    if (url) window.open(url, "_blank");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ferramentas</h1>
        <p className="text-muted-foreground">Catálogo, empréstimos, transferências e manutenções.</p>
      </div>

      <Tabs defaultValue="cat">
        <TabsList>
          <TabsTrigger value="cat">Catálogo</TabsTrigger>
          <TabsTrigger value="emp">Empréstimos</TabsTrigger>
          <TabsTrigger value="transf">Transferências</TabsTrigger>
        </TabsList>

        <TabsContent value="cat" className="space-y-3">
          {canEdit && (
            <Dialog
              open={openF}
              onOpenChange={(v) => {
                setOpenF(v);
                if (!v) setEditing(null);
              }}
            >
              <DialogTrigger asChild>
                <Button onClick={openNewF}>
                  <Plus className="h-4 w-4" /> Nova ferramenta
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editing ? "Editar ferramenta" : "Nova ferramenta"}</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveF.mutate();
                  }}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Nome *</Label>
                      <Input
                        required
                        value={fF.nome ?? ""}
                        onChange={(e) => setFF({ ...fF, nome: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Código</Label>
                      <Input
                        value={fF.codigo ?? ""}
                        onChange={(e) => setFF({ ...fF, codigo: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Próx. manutenção</Label>
                      <Input
                        type="date"
                        value={fF.proxima_manutencao ?? ""}
                        onChange={(e) => setFF({ ...fF, proxima_manutencao: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Estado</Label>
                      <Select value={fF.estado} onValueChange={(v) => setFF({ ...fF, estado: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="disponivel">Disponível</SelectItem>
                          <SelectItem value="emprestada">Emprestada</SelectItem>
                          <SelectItem value="manutencao">Manutenção</SelectItem>
                          <SelectItem value="descartada">Descartada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label>Obra</Label>
                      <Select
                        value={fF.obra_id ?? ""}
                        onValueChange={(v) => setFF({ ...fF, obra_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {obras.map((o: any) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Descrição</Label>
                    <Textarea
                      value={fF.descricao ?? ""}
                      onChange={(e) => setFF({ ...fF, descricao: e.target.value })}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={saveF.isPending}>
                      {editing ? "Salvar" : "Criar"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}

          <Card className="p-3">
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5 items-end">
              <div className="lg:col-span-2">
                <Label className="text-xs">Buscar (nome ou código)</Label>
                <Input
                  value={buscaFer}
                  onChange={(e) => setBuscaFer(e.target.value)}
                  placeholder="Digite para filtrar..."
                />
              </div>
              <div>
                <Label className="text-xs">Estado / Tipo</Label>
                <Select value={estadoInv} onValueChange={setEstadoInv}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="disponivel">Disponível</SelectItem>
                    <SelectItem value="emprestada">Emprestada</SelectItem>
                    <SelectItem value="manutencao">Manutenção</SelectItem>
                    <SelectItem value="descartada">Descartada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Obra</Label>
                <Select value={obraInvFer} onValueChange={setObraInvFer}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="__geral">Geral (sem obra)</SelectItem>
                    {(obras as any[]).map((o: any) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Manutenção</Label>
                <Select value={manutInv} onValueChange={setManutInv}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="vencida">Vencida</SelectItem>
                    <SelectItem value="prox_15">Próx. 15 dias</SelectItem>
                    <SelectItem value="com_data">Com data</SelectItem>
                    <SelectItem value="sem_data">Sem data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center mt-3">
              <InventoryImportExport
                kind="ferramentas"
                obras={obras as any[]}
                exportSpec={exportInventarioFerSpec}
                defaultObraId={obraId}
                canImport={canImport}
                onImported={() => {
                  qc.invalidateQueries({ queryKey: ["ferramentas"] });
                  qc.invalidateQueries({ queryKey: ["dash-ferramentas"] });
                }}
              />
              {(buscaFer || estadoInv !== "all" || obraInvFer !== "all" || manutInv !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBuscaFer("");
                    setEstadoInv("all");
                    setObraInvFer("all");
                    setManutInv("all");
                  }}
                >
                  Limpar filtros
                </Button>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {ferramentasFiltradas.length} de {ferramentas.length} — o PDF usa o filtro atual
              </span>
            </div>
          </Card>

          <Card>
            {canEdit && selCatalogo.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-muted/40">
                <span className="text-xs font-medium">
                  {selCatalogo.length} ferramenta(s) selecionada(s)
                </span>
                <Button size="sm" onClick={() => openTransferDialog()}>
                  <ArrowRightLeft className="h-3 w-3 mr-1" /> Transferir de obra
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelCatalogo([])}>
                  Limpar
                </Button>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  {canEdit && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          ferramentasFiltradas.length > 0 &&
                          ferramentasFiltradas.every((f: any) => selCatalogo.includes(f.id))
                        }
                        onCheckedChange={(v) =>
                          setSelCatalogo(
                            v
                              ? ferramentasFiltradas.map((f: any) => f.id)
                              : [],
                          )
                        }
                      />
                    </TableHead>
                  )}
                  <TableHead>Nome</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Próx. manutenção</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagFerramentas.paged.map((f: any) => {
                  const dias = f.proxima_manutencao
                    ? differenceInDays(safeParseISO(f.proxima_manutencao), new Date())
                    : null;
                  const alerta = dias !== null && dias <= 15;
                  const checked = selCatalogo.includes(f.id);
                  return (
                    <TableRow key={f.id}>
                      {canEdit && (
                        <TableCell>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleSelCatalogo(f.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{f.nome}</TableCell>
                      <TableCell className="text-xs">{f.codigo ?? "—"}</TableCell>
                      <TableCell>
                        <span className="text-xs px-2 py-0.5 rounded bg-muted">{f.estado}</span>
                      </TableCell>
                      <TableCell className="text-xs">{f.obra?.nome ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {f.proxima_manutencao ?? "—"}
                        {alerta && (
                          <span className="ml-1 text-warning inline-flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {dias}d
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Transferir esta ferramenta de obra"
                              onClick={() => openTransferDialog([f.id])}
                            >
                              <ArrowRightLeft className="h-4 w-4" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button size="icon" variant="ghost" onClick={() => openEditF(f)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => confirm("Excluir?") && removeF.mutate(f.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {ferramentasFiltradas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {ferramentas.length === 0
                        ? "Nenhuma ferramenta cadastrada."
                        : "Nenhuma ferramenta no filtro atual."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="p-3 border-t">
              <DataPagination
                page={pagFerramentas.page}
                totalPages={pagFerramentas.totalPages}
                total={pagFerramentas.total}
                pageSize={pagFerramentas.pageSize}
                onPageChange={pagFerramentas.setPage}
                onPageSizeChange={pagFerramentas.setPageSize}
                itemLabel="ferramentas"
              />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="emp" className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            {canEdit && (
              <Dialog open={openE} onOpenChange={setOpenE}>
                <DialogTrigger asChild>
                  <Button onClick={openNewLote}>
                    <Plus className="h-4 w-4" /> Nova ficha de empréstimo
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editingEmp ? "Editar item do empréstimo" : "Nova ficha — várias ferramentas"}
                    </DialogTitle>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      emprestar.mutate();
                    }}
                    className="space-y-3"
                  >
                    <div className="space-y-1">
                      <Label>Colaborador *</Label>
                      <Select
                        value={fE.funcionario_id ?? ""}
                        onValueChange={(v) => setFE({ ...fE, funcionario_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o colaborador" />
                        </SelectTrigger>
                        <SelectContent>
                          {funcionarios.map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {editingEmp ? (
                      <div className="space-y-1">
                        <Label>Ferramenta *</Label>
                        <Select
                          value={fE.ferramenta_id ?? ""}
                          onValueChange={(v) => setFE({ ...fE, ferramenta_id: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {(ferramentas as any[]).map((f: any) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.nome} ({f.estado})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label>
                          Ferramentas *{" "}
                          <span className="text-muted-foreground font-normal">
                            ({(fE.ferramenta_ids ?? []).length} selecionada(s) — só disponíveis)
                          </span>
                        </Label>
                        <Input
                          placeholder="Buscar ferramenta por nome ou código..."
                          value={buscaFerrLote}
                          onChange={(e) => setBuscaFerrLote(e.target.value)}
                        />
                        <div className="border rounded-md max-h-56 overflow-y-auto divide-y">
                          {ferramentasLoteFiltradas.map((f: any) => {
                            const checked = (fE.ferramenta_ids ?? []).includes(f.id);
                            return (
                              <label
                                key={f.id}
                                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggleFerrLote(f.id)}
                                />
                                <span className="font-medium">{f.nome}</span>
                                {f.codigo && (
                                  <span className="text-xs text-muted-foreground">{f.codigo}</span>
                                )}
                              </label>
                            );
                          })}
                          {ferramentasLoteFiltradas.length === 0 && (
                            <p className="p-3 text-sm text-muted-foreground">
                              Nenhuma ferramenta disponível{buscaFerrLote ? " para esta busca" : "."}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Empréstimo</Label>
                        <Input
                          type="date"
                          value={fE.data_emprestimo ?? ""}
                          onChange={(e) => setFE({ ...fE, data_emprestimo: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Devolução prevista</Label>
                        <Input
                          type="date"
                          value={fE.prevista_devolucao ?? ""}
                          onChange={(e) => setFE({ ...fE, prevista_devolucao: e.target.value })}
                        />
                      </div>
                    </div>
                    {editingEmp && (
                      <div className="space-y-1">
                        <Label>Devolução efetiva (preencher ao devolver)</Label>
                        <Input
                          type="date"
                          value={fE.data_devolucao ?? ""}
                          onChange={(e) => setFE({ ...fE, data_devolucao: e.target.value })}
                        />
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label>Anexo (arquivo — máx. {MAX_UPLOAD_LABEL})</Label>
                      <Input
                        type="file"
                        disabled={uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            if (f.size > MAX_UPLOAD_BYTES) {
                              toast.error(
                                `Arquivo "${f.name}" (${formatFileSize(f.size)}) excede o limite de ${MAX_UPLOAD_LABEL} por arquivo.`,
                              );
                              e.target.value = "";
                              return;
                            }
                            onUpload(f);
                          }
                        }}
                      />
                      {fE.anexo_url && <p className="text-xs text-success">✓ anexo carregado</p>}
                    </div>
                    <div className="space-y-1">
                      <Label>Observações da ficha</Label>
                      <Textarea
                        value={fE.observacoes ?? ""}
                        onChange={(e) => setFE({ ...fE, observacoes: e.target.value })}
                        placeholder="Ex.: obra, turno, condições..."
                      />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={emprestar.isPending}>
                        {editingEmp
                          ? "Salvar item"
                          : `Registrar ficha (${(fE.ferramenta_ids ?? []).length})`}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            <Input
              className="max-w-xs"
              placeholder="Buscar por colaborador ou ferramenta..."
              value={buscaEmp}
              onChange={(e) => setBuscaEmp(e.target.value)}
            />
            <Select value={filtroFicha} onValueChange={setFiltroFicha}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="abertas">Em aberto</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="devolvidas">Devolvidas</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">
              {fichas.length} ficha(s) · {fichas.reduce((a: number, f: any) => a + f.abertas, 0)} item(ns) em aberto
            </span>
          </div>

          <div className="grid gap-3">
            {pagFichas.paged.map((ficha: any) => (
              <Card key={ficha.key} className="p-4 space-y-3">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserCheck className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold leading-tight truncate">{ficha.funcionario_nome}</p>
                      <p className="text-xs text-muted-foreground">
                        Empréstimo: {ficha.data_emprestimo ?? "—"}
                        {ficha.prevista_devolucao && ` · prev: ${ficha.prevista_devolucao}`} ·{" "}
                        {ficha.total} item(ns)
                      </p>
                      {ficha.observacoes && (
                        <p className="text-xs text-muted-foreground truncate">Obs.: {ficha.observacoes}</p>
                      )}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Badge variant={ficha.status === "aberta" ? "default" : ficha.status === "parcial" ? "secondary" : "outline"}>
                      {ficha.status === "aberta"
                        ? `Aberta (${ficha.abertas})`
                        : ficha.status === "parcial"
                          ? `Parcial (${ficha.abertas}/${ficha.total} abertos)`
                          : "Devolvida"}
                    </Badge>
                    {ficha.anexo_url && (
                      <Button size="icon" variant="ghost" onClick={() => openAnexo(ficha.anexo_url)} title="Ver anexo">
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => imprimirFicha(ficha)} title="Imprimir ficha">
                      <Printer className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="border rounded-md divide-y">
                  {ficha.itens.map((e: any) => (
                    <div key={e.id} className="flex items-center gap-2 px-3 py-2">
                      <PackageOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight">{e.ferramenta?.nome ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {e.data_devolucao ? `Devolvido em ${e.data_devolucao}` : "Em posse do colaborador"}
                        </p>
                      </div>
                      {!e.data_devolucao && canEdit && (
                        <Button size="sm" variant="outline" onClick={() => devolver.mutate(e)} title="Devolver só esta ferramenta">
                          <Undo2 className="h-3 w-3 mr-1" /> Devolver item
                        </Button>
                      )}
                      {canEdit && (
                        <Button size="icon" variant="ghost" onClick={() => openEditEmp(e)} title="Editar item">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => confirm(`Remover "${e.ferramenta?.nome}" desta ficha?`) && removeEmprestimo.mutate(e)}
                          title="Remover item"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  {ficha.abertas > 0 && canEdit && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => confirm(`Devolver as ${ficha.abertas} ferramenta(s) de ${ficha.funcionario_nome}?`) && devolverFicha.mutate(ficha)}
                        disabled={devolverFicha.isPending}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Devolver ficha toda ({ficha.abertas})
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setFichaAlvo(ficha);
                          setAddFerrId("");
                          setOpenAdd(true);
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Adicionar ferramenta
                      </Button>
                    </>
                  )}
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => confirm(`Excluir a ficha de ${ficha.funcionario_nome} (${ficha.total} item(ns))?`) && removeFicha.mutate(ficha)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Excluir ficha
                    </Button>
                  )}
                </div>
              </Card>
            ))}
            {fichas.length === 0 && (
              <Card className="p-8 text-center text-muted-foreground">
                {emprestimos.length === 0 ? "Nenhuma ficha de empréstimo." : "Nenhuma ficha neste filtro."}
              </Card>
            )}
          </div>
          {fichas.length > 0 && (
            <Card className="p-3">
              <DataPagination
                page={pagFichas.page}
                totalPages={pagFichas.totalPages}
                total={pagFichas.total}
                pageSize={pagFichas.pageSize}
                onPageChange={pagFichas.setPage}
                onPageSizeChange={pagFichas.setPageSize}
                itemLabel="fichas"
              />
            </Card>
          )}

          {canEdit && (
            <Dialog open={openAdd} onOpenChange={setOpenAdd}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar ferramenta à ficha de {fichaAlvo?.funcionario_nome}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Ferramenta disponível *</Label>
                    <Select value={addFerrId} onValueChange={setAddFerrId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {ferramentasDisponiveis.map((f: any) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.nome}{f.codigo ? ` · ${f.codigo}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => addNaFicha.mutate()} disabled={addNaFicha.isPending || !addFerrId}>
                      Adicionar
                    </Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>

        <TabsContent value="transf" className="space-y-3">
          <Card className="p-3 space-y-3">
            <div className="grid gap-2 md:grid-cols-3 items-end">
              <div>
                <Label className="text-xs">Obra de origem</Label>
                <Select value={transfOrigem} onValueChange={(v) => { setTransfOrigem(v); setTransfIds([]); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="__geral">Geral (sem obra)</SelectItem>
                    {(obras as any[]).map((o: any) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Buscar ferramenta (nome ou código)</Label>
                <Input
                  value={transfBusca}
                  onChange={(e) => setTransfBusca(e.target.value)}
                  placeholder="Digite para filtrar..."
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground">
                {ferramentasTransferiveis.length} ferramenta(s) · {transfIds.length} selecionada(s)
              </span>
              <div className="ml-auto flex gap-2">
                {transfIds.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setTransfIds([])}>
                    Limpar seleção
                  </Button>
                )}
                {canEdit && (
                  <Button
                    size="sm"
                    disabled={transfIds.length === 0}
                    onClick={() => setOpenT(true)}
                  >
                    <ArrowRightLeft className="h-3 w-3 mr-1" /> Transferir ({transfIds.length})
                  </Button>
                )}
              </div>
            </div>
            <div className="border rounded-md max-h-72 overflow-y-auto divide-y">
              {ferramentasTransferiveis.map((f: any) => {
                const checked = transfIds.includes(f.id);
                return (
                  <label
                    key={f.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                  >
                    {canEdit ? (
                      <Checkbox checked={checked} onCheckedChange={() => toggleTransfId(f.id)} />
                    ) : null}
                    <span className="font-medium">{f.nome}</span>
                    {f.codigo && <span className="text-xs text-muted-foreground">{f.codigo}</span>}
                    <span className="text-xs px-2 py-0.5 rounded bg-muted ml-1">{f.estado}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {(f as any).obra?.nome ?? "Geral"}
                    </span>
                  </label>
                );
              })}
              {ferramentasTransferiveis.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">
                  Nenhuma ferramenta para esta origem/busca.
                </p>
              )}
            </div>
          </Card>

          <div className="grid gap-2">
            {pagLotesTransf.paged.map((lote: any) => (
              <Card key={lote.key} className="p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <ArrowRightLeft className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {lote.origem_nome} → {lote.destino_nome} · {lote.itens.length} item(ns)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {lote.created_at ? new Date(lote.created_at).toLocaleString("pt-BR") : "—"}
                      {lote.motivo ? ` · ${lote.motivo}` : ""}
                    </p>
                    <p className="text-xs mt-1">
                      {lote.itens.map((i: any) => i.ferramenta?.nome ?? "—").join(", ")}
                    </p>
                  </div>
                  {canDelete && (
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Excluir histórico"
                      onClick={() => confirm("Excluir este histórico de transferência? (não desfaz a obra atual)") && removeLoteTransferencia.mutate(lote)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
            {lotesTransferencia.length === 0 && (
              <Card className="p-8 text-center text-muted-foreground">
                Nenhuma transferência registrada ainda. Selecione uma ou mais ferramentas acima para transferir de obra.
              </Card>
            )}
          </div>
          {lotesTransferencia.length > 0 && (
            <Card className="p-3">
              <DataPagination
                page={pagLotesTransf.page}
                totalPages={pagLotesTransf.totalPages}
                total={pagLotesTransf.total}
                pageSize={pagLotesTransf.pageSize}
                onPageChange={pagLotesTransf.setPage}
                onPageSizeChange={pagLotesTransf.setPageSize}
                itemLabel="transferências"
              />
            </Card>
          )}

          {canEdit && (
            <Dialog open={openT} onOpenChange={setOpenT}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Transferir {transfIds.length} ferramenta(s) de obra</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="border rounded-md max-h-40 overflow-y-auto divide-y text-sm">
                    {transfIds.map((id) => {
                      const f = (ferramentas as any[]).find((x: any) => x.id === id);
                      if (!f) return null;
                      return (
                        <div key={id} className="px-3 py-1.5 flex items-center gap-2">
                          <span className="font-medium">{f.nome}</span>
                          {f.codigo && <span className="text-xs text-muted-foreground">{f.codigo}</span>}
                          <span className="text-xs text-muted-foreground ml-auto">
                            {(f as any).obra?.nome ?? "Geral"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="space-y-1">
                    <Label>Obra de destino *</Label>
                    <Select value={transfDestino} onValueChange={setTransfDestino}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a obra destino" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__geral">Geral (sem obra)</SelectItem>
                        {(obras as any[]).map((o: any) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Motivo / observações</Label>
                    <Textarea
                      value={transfMotivo}
                      onChange={(e) => setTransfMotivo(e.target.value)}
                      placeholder="Ex.: remanejamento, fim de etapa, reforço de equipe..."
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      disabled={transferir.isPending || transfIds.length === 0}
                      onClick={() => transferir.mutate()}
                    >
                      {transferir.isPending ? "Transferindo..." : `Confirmar transferência (${transfIds.length})`}
                    </Button>
                  </DialogFooter>
                  <p className="text-[11px] text-muted-foreground">
                    Ferramentas emprestadas precisam ser devolvidas antes da transferência.
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
