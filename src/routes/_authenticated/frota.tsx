import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useModulePerm, useCurrentUser } from "@/lib/permissions";
import { useObraAtual } from "@/lib/obra-context.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Truck,
  Fuel,
  Wrench,
  Receipt,
  Waypoints,
  Users,
  Plus,
  Trash2,
  LayoutDashboard,
  AlertTriangle,
  FileDown,
  FileText,
  Upload,
  TrendingUp,
  Gauge,
  PenLine,
  Search,
  Crown,
  Sparkles,
  Loader2,
  Paperclip,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { exportCSV, exportPDF } from "@/lib/exports";
import { formatCurrency } from "@/lib/utils";
import { uploadAnexo, getAnexoUrl } from "@/lib/upload";
import { lerNotaAbastecimento, lerNotaAbastecimentoPdf } from "@/lib/ocr.functions";
import {
  calcConsumo,
  calcLinhaConsumo,
  alertaRevisao,
  statusCNH,
  CATEGORIAS_GASTO,
  TIPOS_COMBUSTIVEL,
  TIPOS_SERVICO,
  OPERADORAS_TAG,
  parseCSVPedagio,
  rankingMotoristas,
} from "@/lib/frota";

export const Route = createFileRoute("/_authenticated/frota")({ component: FrotaPage });

function FrotaPage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { obraId } = useObraAtual();
  const perm = useModulePerm("frota");
  const canEdit = perm.can_edit;
  const canDelete = perm.can_delete;

  const [activeTab, setActiveTab] = useState("visao");
  const [search, setSearch] = useState("");

  // ---- QUERIES ----
  const { data: veiculos = [] } = useQuery({
    queryKey: ["frota-veiculos", obraId],
    queryFn: async () => {
      let q = supabase.from("frota_veiculos").select("*, obra:obras(nome)").order("placa");
      if (obraId) q = q.eq("obra_id", obraId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: motoristas = [] } = useQuery({
    queryKey: ["frota-motoristas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("frota_motoristas").select("*").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: abastecimentos = [] } = useQuery({
    queryKey: ["frota-abastecimentos", obraId],
    queryFn: async () => {
      let q = supabase
        .from("frota_abastecimentos")
        .select("*, veiculo:frota_veiculos(placa, modelo), motorista:frota_motoristas(nome)")
        .order("data", { ascending: false })
        .order("odometro", { ascending: false });
      if (obraId) q = q.eq("obra_id", obraId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: manutencoes = [] } = useQuery({
    queryKey: ["frota-manutencoes", obraId],
    queryFn: async () => {
      let q = supabase
        .from("frota_manutencoes")
        .select("*, veiculo:frota_veiculos(placa, modelo)")
        .order("data", { ascending: false });
      if (obraId) q = q.eq("obra_id", obraId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: gastos = [] } = useQuery({
    queryKey: ["frota-gastos", obraId],
    queryFn: async () => {
      let q = supabase
        .from("frota_gastos_avulsos")
        .select("*, veiculo:frota_veiculos(placa, modelo), motorista:frota_motoristas(nome)")
        .order("data", { ascending: false });
      if (obraId) q = q.eq("obra_id", obraId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: pedagios = [] } = useQuery({
    queryKey: ["frota-pedagios", obraId],
    queryFn: async () => {
      let q = supabase
        .from("frota_pedagios")
        .select("*, veiculo:frota_veiculos(placa, modelo), motorista:frota_motoristas(nome)")
        .order("data_hora", { ascending: false });
      if (obraId) q = q.eq("obra_id", obraId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: obras = [] } = useQuery({
    queryKey: ["obras-min-frota"],
    queryFn: async () => (await supabase.from("obras").select("id, nome").order("nome")).data ?? [],
  });

  // ---- KPIs ----
  const kpis = useMemo(() => {
    const totalAbast = abastecimentos.reduce((s: number, a: any) => s + Number(a.valor_total), 0);
    const totalManut = manutencoes.reduce((s: number, m: any) => s + Number(m.valor_total ?? 0), 0);
    const totalGastos = gastos.reduce((s: number, g: any) => s + Number(g.valor), 0);
    const totalPed = pedagios.reduce((s: number, p: any) => s + Number(p.valor), 0);
    const consumoGeral = calcConsumo(abastecimentos as any);
    const alertas = veiculos.filter((v: any) => {
      const a = alertaRevisao(v);
      return a.nivel !== "ok";
    }).length;
    const cnhVenc = motoristas.filter((m: any) => statusCNH(m.cnh_validade).nivel === "vencido").length;
    const cnhAtencao = motoristas.filter((m: any) => statusCNH(m.cnh_validade).nivel === "atencao").length;
    return { totalAbast, totalManut, totalGastos, totalPed, totalGeral: totalAbast + totalManut + totalGastos + totalPed, consumoGeral, alertas, cnhVenc, cnhAtencao };
  }, [veiculos, motoristas, abastecimentos, manutencoes, gastos, pedagios]);

  const ranking = useMemo(
    () => rankingMotoristas(motoristas as any, abastecimentos as any, gastos as any, pedagios as any),
    [motoristas, abastecimentos, gastos, pedagios]
  );

  // consumo por veículo
  const consumoPorVeiculo = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calcConsumo>>();
    for (const v of veiculos as any[]) {
      const abs = (abastecimentos as any[]).filter((a) => a.veiculo_id === v.id);
      map.set(v.id, calcConsumo(abs));
    }
    return map;
  }, [veiculos, abastecimentos]);

  // ---- FORMS STATE ----
  const defaultVeiculoForm = { status: "ativo", tipo: "leve", combustivel_padrao: "diesel", intervalo_revisao_km: 10000, intervalo_revisao_meses: 6 };
  const [openV, setOpenV] = useState(false);
  const [fV, setFV] = useState<any>(defaultVeiculoForm);
  const [editVeiculoId, setEditVeiculoId] = useState<string | null>(null);

  const abrirNovoVeiculo = () => {
    setEditVeiculoId(null);
    setFV(defaultVeiculoForm);
    setOpenV(true);
  };

  const abrirEditarVeiculo = (v: any) => {
    setEditVeiculoId(v.id);
    setFV({
      placa: v.placa ?? "",
      modelo: v.modelo ?? "",
      marca: v.marca ?? "",
      ano: v.ano ?? "",
      tipo: v.tipo ?? "leve",
      combustivel_padrao: v.combustivel_padrao ?? "diesel",
      odometro_atual: v.odometro_atual ?? "",
      status: v.status ?? "ativo",
      odometro_proxima_revisao: v.odometro_proxima_revisao ?? "",
      data_proxima_revisao: v.data_proxima_revisao ?? "",
      obra_id: v.obra_id ?? null,
      intervalo_revisao_km: v.intervalo_revisao_km ?? 10000,
      intervalo_revisao_meses: v.intervalo_revisao_meses ?? 6,
      observacoes: v.observacoes ?? "",
    });
    setOpenV(true);
  };
  const [openA, setOpenA] = useState(false);
  const [fA, setFA] = useState<any>({ tipo_combustivel: "diesel", tanque_cheio: true });
  const [abastComprovante, setAbastComprovante] = useState<File | null>(null);
  const [lendoNotaAbast, setLendoNotaAbast] = useState(false);

  // Lê nota/cupom fiscal (imagem ou PDF) com IA e preenche o formulário de abastecimento
  const lerNotaAbast = async (file: File) => {
    const isImagem = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImagem && !isPdf) {
      toast.error("Envie a nota em JPG, PNG, WEBP ou PDF.");
      return;
    }
    if (file.size > (isPdf ? 50 : 5) * 1024 * 1024) {
      toast.error(isPdf ? "O PDF deve ter no máximo 50 MB." : "A imagem deve ter no máximo 5 MB.");
      return;
    }
    setLendoNotaAbast(true);
    try {
      const fileDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
        reader.readAsDataURL(file);
      });
      const dados = isPdf
        ? await lerNotaAbastecimentoPdf({ data: { pdfBase64: fileDataUrl.split(",")[1] } })
        : await lerNotaAbastecimento({ data: { imageDataUrl: fileDataUrl } });
      setFA((atual: any) => {
        const next: any = { ...atual };
        if (dados.data) next.data = dados.data;
        if (dados.posto) next.posto = dados.posto;
        if (dados.litros != null) next.litros = dados.litros;
        if (dados.valor_por_litro != null) next.valor_por_litro = dados.valor_por_litro;
        if (dados.odometro != null) next.odometro = dados.odometro;
        if (dados.tipo_combustivel) {
          const alvo = dados.tipo_combustivel.toLowerCase();
          const match = (TIPOS_COMBUSTIVEL as readonly string[]).find((t) => t.toLowerCase() === alvo);
          if (match) next.tipo_combustivel = match;
        }
        return next;
      });
      // Guarda o arquivo como anexo do abastecimento
      setAbastComprovante(file);
      toast.success("Nota lida com sucesso. Confira os dados antes de salvar.");
    } catch (e: any) {
      toast.error(e.message ?? "Não foi possível ler a nota");
    } finally {
      setLendoNotaAbast(false);
    }
  };

  const abrirComprovanteAbast = async (path: string) => {
    const url = await getAnexoUrl(path);
    if (url) window.open(url, "_blank");
    else toast.error("Não foi possível abrir o anexo");
  };
  const [openM, setOpenM] = useState(false);
  const [fM, setFM] = useState<any>({ tipo: "preventiva", servico: "troca de óleo" });
  const [openG, setOpenG] = useState(false);
  const [fG, setFG] = useState<any>({ categoria: "lavagem" });
  const [openP, setOpenP] = useState(false);
  const [fP, setFP] = useState<any>({ forma_pagamento: "tag", tag_operadora: "Sem Parar" });
  const [openMot, setOpenMot] = useState(false);
  const [fMot, setFMot] = useState<any>({ cnh_categoria: "B", status: "ativo" });
  const [editMotId, setEditMotId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  // ---- MUTATIONS ----
  const saveVeiculo = useMutation({
    mutationFn: async () => {
      const payload = { ...fV, placa: fV.placa?.toUpperCase().replace(/[^A-Z0-9]/g, "") };
      if (payload.ano === "" || payload.ano == null) delete payload.ano;
      if (payload.odometro_proxima_revisao === "" || payload.odometro_proxima_revisao == null) delete payload.odometro_proxima_revisao;
      if (!payload.data_proxima_revisao) delete payload.data_proxima_revisao;
      if (!payload.obra_id) payload.obra_id = null;
      if (!payload.placa || !payload.modelo) throw new Error("Placa e modelo são obrigatórios");
      if (editVeiculoId) {
        const { error } = await supabase.from("frota_veiculos").update(payload).eq("id", editVeiculoId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("frota_veiculos").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editVeiculoId ? "Veículo atualizado" : "Veículo cadastrado");
      qc.invalidateQueries({ queryKey: ["frota-veiculos"] });
      setOpenV(false);
      setFV(defaultVeiculoForm);
      setEditVeiculoId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const removeVeiculo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("frota_veiculos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Veículo removido");
      qc.invalidateQueries({ queryKey: ["frota-veiculos"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const createAbast = useMutation({
    mutationFn: async () => {
      const valor_total = Number(fA.litros) * Number(fA.valor_por_litro);
      const payload: any = { ...fA, valor_total: isNaN(valor_total) ? fA.valor_total : valor_total, created_by: user?.id, obra_id: fA.obra_id ?? obraId ?? null };
      delete payload.comprovante_url;
      if (!payload.veiculo_id || !payload.odometro || !payload.litros || !payload.valor_por_litro) throw new Error("Preencha veículo, odômetro, litros e valor/litro");
      const { data: inserted, error } = await supabase.from("frota_abastecimentos").insert(payload).select("id").single();
      if (error) throw error;
      // anexa a nota/cupom fiscal (imagem ou PDF) ao abastecimento
      if (abastComprovante && (inserted as any)?.id) {
        try {
          const path = await uploadAnexo(abastComprovante, `frota/abastecimentos/${(inserted as any).id}`);
          const { error: updErr } = await supabase.from("frota_abastecimentos").update({ comprovante_url: path } as any).eq("id", (inserted as any).id);
          if (updErr) throw updErr;
        } catch (e: any) {
          throw new Error(`Abastecimento salvo, mas o anexo falhou: ${e.message}`);
        }
      }
      // atualiza odômetro atual do veículo se maior
      const veic = (veiculos as any[]).find((v) => v.id === payload.veiculo_id);
      if (veic && Number(payload.odometro) > Number(veic.odometro_atual)) {
        await supabase.from("frota_veiculos").update({ odometro_atual: Number(payload.odometro) }).eq("id", payload.veiculo_id);
      }
    },
    onSuccess: () => {
      toast.success("Abastecimento registrado");
      qc.invalidateQueries({ queryKey: ["frota-abastecimentos"] });
      qc.invalidateQueries({ queryKey: ["frota-veiculos"] });
      setOpenA(false);
      setFA({ tipo_combustivel: "diesel", tanque_cheio: true });
      setAbastComprovante(null);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const removeAbast = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("frota_abastecimentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["frota-abastecimentos"] }),
  });
  const createManut = useMutation({
    mutationFn: async () => {
      const payload: any = { ...fM, created_by: user?.id, obra_id: fM.obra_id ?? obraId ?? null };
      if (!payload.veiculo_id || !payload.servico) throw new Error("Veículo e serviço obrigatórios");
      const { error } = await supabase.from("frota_manutencoes").insert(payload);
      if (error) throw error;
      if (payload.proxima_revisao_km || payload.proxima_revisao_data) {
        const upd: any = {};
        if (payload.proxima_revisao_km) upd.odometro_proxima_revisao = payload.proxima_revisao_km;
        if (payload.proxima_revisao_data) upd.data_proxima_revisao = payload.proxima_revisao_data;
        await supabase.from("frota_veiculos").update(upd).eq("id", payload.veiculo_id);
      }
    },
    onSuccess: () => {
      toast.success("Manutenção registrada");
      qc.invalidateQueries({ queryKey: ["frota-manutencoes"] });
      qc.invalidateQueries({ queryKey: ["frota-veiculos"] });
      setOpenM(false);
      setFM({ tipo: "preventiva", servico: "troca de óleo" });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const removeManut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("frota_manutencoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["frota-manutencoes"] }),
  });
  const createGasto = useMutation({
    mutationFn: async () => {
      const payload: any = { ...fG, created_by: user?.id, obra_id: fG.obra_id ?? obraId ?? null };
      if (!payload.descricao || !payload.valor) throw new Error("Descrição e valor obrigatórios");
      const { error } = await supabase.from("frota_gastos_avulsos").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gasto registrado");
      qc.invalidateQueries({ queryKey: ["frota-gastos"] });
      setOpenG(false);
      setFG({ categoria: "lavagem" });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const removeGasto = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("frota_gastos_avulsos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["frota-gastos"] }),
  });
  const createPedagio = useMutation({
    mutationFn: async () => {
      const payload: any = { ...fP, created_by: user?.id, obra_id: fP.obra_id ?? obraId ?? null };
      if (!payload.veiculo_id || !payload.praca || !payload.valor) throw new Error("Veículo, praça e valor obrigatórios");
      if (!payload.data_hora) payload.data_hora = new Date().toISOString();
      const { error } = await supabase.from("frota_pedagios").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedágio registrado");
      qc.invalidateQueries({ queryKey: ["frota-pedagios"] });
      setOpenP(false);
      setFP({ forma_pagamento: "tag", tag_operadora: "Sem Parar" });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const removePedagio = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("frota_pedagios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["frota-pedagios"] }),
  });
  const saveMotorista = useMutation({
    mutationFn: async () => {
      const payload: any = { ...fMot, created_by: user?.id };
      if (!payload.nome) throw new Error("Nome obrigatório");
      if (payload.cpf) payload.cpf = payload.cpf.replace(/\D/g, "");
      if (editMotId) {
        const { error } = await supabase.from("frota_motoristas").update(payload).eq("id", editMotId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("frota_motoristas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editMotId ? "Motorista atualizado" : "Motorista cadastrado");
      qc.invalidateQueries({ queryKey: ["frota-motoristas"] });
      setOpenMot(false);
      setFMot({ cnh_categoria: "B", status: "ativo" });
      setEditMotId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const removeMotorista = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("frota_motoristas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["frota-motoristas"] }),
  });

  // CSV import
  const handleImportPedagio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSVPedagio(text);
    if (rows.length === 0) {
      toast.error("Nenhum registro válido encontrado no CSV");
      return;
    }
    // tenta mapear placa -> veiculo_id
    const placaMap = new Map((veiculos as any[]).map((v) => [v.placa.toUpperCase(), v.id]));
    let ok = 0;
    for (const r of rows) {
      const veiculo_id = r.veiculo_placa ? placaMap.get(r.veiculo_placa.toUpperCase().replace(/[^A-Z0-9]/g, "")) : (veiculos as any[])[0]?.id;
      if (!veiculo_id) continue;
      const { error } = await supabase.from("frota_pedagios").insert({
        veiculo_id,
        praca: r.praca,
        rota: r.rota,
        valor: r.valor,
        data_hora: r.data_hora,
        forma_pagamento: "tag",
        tag_operadora: "Sem Parar",
        created_by: user?.id,
        obra_id: obraId ?? null,
      } as any);
      if (!error) ok++;
    }
    toast.success(`${ok}/${rows.length} pedágios importados`);
    qc.invalidateQueries({ queryKey: ["frota-pedagios"] });
    if (fileRef.current) fileRef.current.value = "";
  };

  const exportAbast = (kind: "csv" | "pdf") => {
    const headers = ["Data", "Veículo", "Motorista", "Odômetro", "Litros", "Combustível", "R$/L", "Total", "km/L", "R$/km"];
    // montar mapa veiculo_id -> lista ordenada para km/L por linha
    const byVeic = new Map<string, any[]>();
    for (const a of [...(abastecimentos as any[])].reverse()) {
      const arr = byVeic.get(a.veiculo_id) ?? [];
      arr.push(a);
      byVeic.set(a.veiculo_id, arr);
    }
    const sorted = [...(abastecimentos as any[])].sort((a, b) => a.data.localeCompare(b.data));
    const rows = sorted.map((a) => {
      const list = byVeic.get(a.veiculo_id) ?? [];
      const idx = list.findIndex((x) => x.id === a.id);
      const prev = idx > 0 ? list[idx - 1] : null;
      const { mediaKml, custoPorKm } = calcLinhaConsumo(a, prev);
      return [
        a.data,
        a.veiculo?.placa ?? a.veiculo_id.slice(0, 8),
        a.motorista?.nome ?? "—",
        String(a.odometro),
        Number(a.litros).toFixed(2),
        a.tipo_combustivel,
        Number(a.valor_por_litro).toFixed(2),
        Number(a.valor_total).toFixed(2),
        mediaKml != null ? mediaKml.toFixed(2) : "—",
        custoPorKm != null ? custoPorKm.toFixed(2) : "—",
      ];
    });
    if (kind === "csv") exportCSV(`frota-abastecimentos-${new Date().toISOString().slice(0, 10)}`, headers, rows);
    else exportPDF("Frota — Abastecimentos", headers, rows);
  };

  if (!perm.can_view) {
    return <Card className="p-8 text-center text-muted-foreground">Você não tem permissão para visualizar Gestão de Frota.</Card>;
  }

  const filteredVeiculos = (veiculos as any[]).filter((v) =>
    !search ? true : `${v.placa} ${v.modelo} ${v.marca ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="h-7 w-7 text-primary" /> Gestão de Frota
        </h1>
        <p className="text-muted-foreground">Custos, eficiência dos veículos e desempenho dos motoristas.</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Truck className="h-3 w-3" /> Veículos</p>
          <p className="text-2xl font-bold">{veiculos.length}</p>
          <p className="text-[11px] text-muted-foreground">{filteredVeiculos.filter((v) => v.status === "ativo").length} ativos</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Motoristas</p>
          <p className="text-2xl font-bold">{motoristas.length}</p>
          <p className="text-[11px] text-muted-foreground">{(motoristas as any[]).filter((m) => m.status === "ativo").length} ativos</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Gauge className="h-3 w-3" /> Média Geral</p>
          <p className="text-2xl font-bold">{kpis.consumoGeral.mediaKml != null ? `${kpis.consumoGeral.mediaKml.toFixed(2)} km/L` : "—"}</p>
          <p className="text-[11px] text-muted-foreground">{kpis.consumoGeral.custoPorKm != null ? `${formatCurrency(kpis.consumoGeral.custoPorKm)}/km` : "sem dados"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Receipt className="h-3 w-3" /> Custo Total</p>
          <p className="text-2xl font-bold">{formatCurrency(kpis.totalGeral)}</p>
          <p className="text-[11px] text-muted-foreground">comb. {formatCurrency(kpis.totalAbast)}</p>
        </Card>
        <Card className={`p-4 ${kpis.alertas ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/10" : ""}`}>
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Wrench className="h-3 w-3" /> Revisões</p>
          <p className="text-2xl font-bold">{kpis.alertas}</p>
          <p className="text-[11px] text-muted-foreground">{kpis.alertas ? "atenção/vencidas" : "em dia"}</p>
        </Card>
        <Card className={`p-4 ${kpis.cnhVenc ? "border-rose-300 bg-rose-50/40 dark:bg-rose-950/10" : ""}`}>
          <p className="text-xs text-muted-foreground">CNHs vencidas</p>
          <p className="text-2xl font-bold">{kpis.cnhVenc}</p>
          <p className="text-[11px] text-muted-foreground">{kpis.cnhAtencao} a vencer (30d)</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Waypoints className="h-3 w-3" /> Pedágios</p>
          <p className="text-2xl font-bold">{formatCurrency(kpis.totalPed)}</p>
          <p className="text-[11px] text-muted-foreground">{pedagios.length} lançamentos</p>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="visao" className="gap-1"><LayoutDashboard className="h-3.5 w-3.5" /> Visão Geral</TabsTrigger>
            <TabsTrigger value="veiculos" className="gap-1"><Truck className="h-3.5 w-3.5" /> Veículos</TabsTrigger>
            <TabsTrigger value="combustivel" className="gap-1"><Fuel className="h-3.5 w-3.5" /> Combustível</TabsTrigger>
            <TabsTrigger value="manutencao" className="gap-1"><Wrench className="h-3.5 w-3.5" /> Manutenções</TabsTrigger>
            <TabsTrigger value="gastos" className="gap-1"><Receipt className="h-3.5 w-3.5" /> Gastos Avulsos</TabsTrigger>
            <TabsTrigger value="pedagios" className="gap-1"><Waypoints className="h-3.5 w-3.5" /> Pedágios</TabsTrigger>
            <TabsTrigger value="motoristas" className="gap-1"><Users className="h-3.5 w-3.5" /> Motoristas</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 w-[200px]" />
            </div>
          </div>
        </div>

        {/* VISÃO GERAL */}
        <TabsContent value="visao" className="space-y-4 mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Fuel className="h-4 w-4" /> Eficiência por Veículo (km/L)</CardTitle></CardHeader>
              <CardContent>
                {veiculos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum veículo.</p> : <div className="space-y-2">
                  {(veiculos as any[]).map((v) => {
                    const c = consumoPorVeiculo.get(v.id);
                    const a = alertaRevisao(v);
                    return (
                      <div key={v.id} className="flex items-center justify-between rounded-lg border p-2.5">
                        <div>
                          <p className="text-sm font-medium">{v.placa} — {v.modelo}</p>
                          <p className="text-xs text-muted-foreground">{Number(v.odometro_atual ?? 0).toLocaleString("pt-BR")} km · {a.nivel === "vencido" ? <span className="text-rose-600 font-semibold">{a.msg}</span> : a.nivel === "atencao" ? <span className="text-amber-600">{a.msg}</span> : <span>{a.msg}</span>}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">{c?.mediaKml != null ? `${c.mediaKml.toFixed(2)} km/L` : "—"}</p>
                          <p className="text-xs text-muted-foreground">{c?.custoPorKm != null ? `${formatCurrency(c.custoPorKm)}/km` : "—"}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" /> Ranking Motoristas (eficiência)</CardTitle><CardDescription className="text-xs">Maior km/L primeiro · considera apenas abastecimentos vinculados</CardDescription></CardHeader>
              <CardContent>
                {ranking.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados.</p> :
                  <div className="space-y-2">
                    {ranking.slice(0, 8).map((r, idx) => (
                      <div key={r.motorista.id} className="flex items-center justify-between rounded-lg border p-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? "bg-amber-400 text-white" : idx === 1 ? "bg-zinc-400 text-white" : idx === 2 ? "bg-amber-700 text-white" : "bg-muted text-muted-foreground"}`}>{idx + 1}</span>
                          <div>
                            <p className="text-sm font-medium">{r.motorista.nome}</p>
                            <p className="text-xs text-muted-foreground">{r.totalAbast} abastec. · {formatCurrency(r.gastoTotal)} total</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">{r.mediaKml != null ? `${r.mediaKml.toFixed(2)} km/L` : "—"}</p>
                          <p className="text-xs text-muted-foreground">{statusCNH(r.motorista.cnh_validade).label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                }
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4"><p className="text-xs text-muted-foreground">Combustível (total)</p><p className="text-xl font-bold">{formatCurrency(kpis.totalAbast)} · {(abastecimentos as any[]).length} abastec.</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Manutenções (total)</p><p className="text-xl font-bold">{formatCurrency(kpis.totalManut)} · {(manutencoes as any[]).length} regs.</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Avulsos + Pedágios</p><p className="text-xl font-bold">{formatCurrency(kpis.totalGastos + kpis.totalPed)} · {(gastos as any[]).length + (pedagios as any[]).length} regs.</p></Card>
          </div>
        </TabsContent>

        {/* VEÍCULOS */}
        <TabsContent value="veiculos" className="space-y-3 mt-4">
          {canEdit && (
            <Dialog open={openV} onOpenChange={(o) => { setOpenV(o); if (!o) { setEditVeiculoId(null); setFV(defaultVeiculoForm); } }}>
              <DialogTrigger asChild><Button onClick={abrirNovoVeiculo}><Plus className="h-4 w-4" /> Novo veículo</Button></DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>{editVeiculoId ? "Editar veículo" : "Novo veículo"}</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); saveVeiculo.mutate(); }} className="grid gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>Placa *</Label><Input required value={fV.placa ?? ""} onChange={(e) => setFV({ ...fV, placa: e.target.value.toUpperCase() })} placeholder="ABC1234" maxLength={7} /></div>
                    <div className="space-y-1"><Label>Modelo *</Label><Input required value={fV.modelo ?? ""} onChange={(e) => setFV({ ...fV, modelo: e.target.value })} placeholder="Ex: Hilux, Strada" /></div>
                    <div className="space-y-1"><Label>Marca</Label><Input value={fV.marca ?? ""} onChange={(e) => setFV({ ...fV, marca: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Ano</Label><Input type="number" value={fV.ano ?? ""} onChange={(e) => setFV({ ...fV, ano: e.target.value ? Number(e.target.value) : null })} /></div>
                    <div className="space-y-1"><Label>Tipo</Label>
                      <Select value={fV.tipo} onValueChange={(v) => setFV({ ...fV, tipo: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="leve">Leve</SelectItem><SelectItem value="pesado">Pesado</SelectItem><SelectItem value="van">Van</SelectItem><SelectItem value="caminhao">Caminhão</SelectItem><SelectItem value="maquina">Máquina</SelectItem></SelectContent></Select>
                    </div>
                    <div className="space-y-1"><Label>Combustível padrão</Label>
                      <Select value={fV.combustivel_padrao} onValueChange={(v) => setFV({ ...fV, combustivel_padrao: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPOS_COMBUSTIVEL.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <div className="space-y-1"><Label>Odômetro atual *</Label><Input type="number" required value={fV.odometro_atual ?? ""} onChange={(e) => setFV({ ...fV, odometro_atual: Number(e.target.value) })} /></div>
                    <div className="space-y-1"><Label>Status</Label>
                      <Select value={fV.status} onValueChange={(v) => setFV({ ...fV, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="manutencao">Manutenção</SelectItem><SelectItem value="inativo">Inativo</SelectItem><SelectItem value="vendido">Vendido</SelectItem></SelectContent></Select>
                    </div>
                    <div className="space-y-1"><Label>Próx. revisão (km)</Label><Input type="number" value={fV.odometro_proxima_revisao ?? ""} onChange={(e) => setFV({ ...fV, odometro_proxima_revisao: e.target.value ? Number(e.target.value) : null })} placeholder="ex: 50000" /></div>
                    <div className="space-y-1"><Label>Próx. revisão (data)</Label><Input type="date" value={fV.data_proxima_revisao ?? ""} onChange={(e) => setFV({ ...fV, data_proxima_revisao: e.target.value || null })} /></div>
                    <div className="space-y-1"><Label>Obra</Label>
                      <Select value={fV.obra_id ?? "none"} onValueChange={(v) => setFV({ ...fV, obra_id: v === "none" ? null : v })}><SelectTrigger><SelectValue placeholder="Sem obra" /></SelectTrigger><SelectContent><SelectItem value="none">Sem obra</SelectItem>{obras.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <div className="space-y-1"><Label>Intervalo revisão (km)</Label><Input type="number" value={fV.intervalo_revisao_km ?? 10000} onChange={(e) => setFV({ ...fV, intervalo_revisao_km: Number(e.target.value) })} /></div>
                  </div>
                  <div className="space-y-1"><Label>Observações</Label><Textarea value={fV.observacoes ?? ""} onChange={(e) => setFV({ ...fV, observacoes: e.target.value })} /></div>
                  <DialogFooter><Button type="submit" disabled={saveVeiculo.isPending}>{saveVeiculo.isPending ? "Salvando..." : editVeiculoId ? "Atualizar" : "Cadastrar"}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredVeiculos.map((v: any) => {
              const alerta = alertaRevisao(v);
              const consumo = consumoPorVeiculo.get(v.id);
              return (
                <Card key={v.id} className={`p-4 ${alerta.nivel === "vencido" ? "border-rose-300" : alerta.nivel === "atencao" ? "border-amber-300" : ""}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold flex items-center gap-2">{v.placa} <Badge variant="outline">{v.tipo}</Badge> <Badge variant={v.status === "ativo" ? "default" : v.status === "manutencao" ? "secondary" : "outline"}>{v.status}</Badge></p>
                      <p className="text-sm text-muted-foreground">{v.marca ?? ""} {v.modelo} {v.ano ? `· ${v.ano}` : ""}</p>
                      <p className="text-xs text-muted-foreground mt-1">{Number(v.odometro_atual ?? 0).toLocaleString("pt-BR")} km rodados {v.obra?.nome ? `· ${v.obra.nome}` : ""}</p>
                      <p className={`text-xs mt-1 ${alerta.nivel === "vencido" ? "text-rose-600 font-semibold" : alerta.nivel === "atencao" ? "text-amber-600" : "text-muted-foreground"}`}>{alerta.nivel !== "ok" && <AlertTriangle className="h-3 w-3 inline mr-1" />}{alerta.msg}</p>
                      <div className="mt-2 flex gap-3 text-xs">
                        <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />{consumo?.mediaKml != null ? `${consumo.mediaKml.toFixed(2)} km/L` : "—"}</span>
                        <span className="flex items-center gap-1"><Gauge className="h-3 w-3" />{consumo?.custoPorKm != null ? `${formatCurrency(consumo.custoPorKm)}/km` : "—"}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {canEdit && <Button size="icon" variant="ghost" title="Editar veículo" onClick={() => abrirEditarVeiculo(v)}><PenLine className="h-4 w-4" /></Button>}
                      {canDelete && <Button size="icon" variant="ghost" onClick={() => confirm("Excluir veículo? Isso apagará abastecimentos e registros vinculados.") && removeVeiculo.mutate(v.id)}><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </div>
                </Card>
              );
            })}
            {filteredVeiculos.length === 0 && <Card className="p-8 text-center text-muted-foreground md:col-span-3">Nenhum veículo cadastrado.</Card>}
          </div>
        </TabsContent>

        {/* COMBUSTÍVEL */}
        <TabsContent value="combustivel" className="space-y-3 mt-4">
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Dialog open={openA} onOpenChange={(o) => { setOpenA(o); if (!o) setAbastComprovante(null); }}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Novo abastecimento</Button></DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Novo abastecimento</DialogTitle></DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); createAbast.mutate(); }} className="space-y-3">
                    <div className="rounded-lg border border-primary/30 bg-primary/[0.03] p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold">Preenchimento automático por IA</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Fotografe a nota ou cupom fiscal do posto (imagem ou PDF) e a IA preenche data, posto, litros e valores.</p>
                      <div className="flex items-center gap-2">
                        <Input
                          type="file"
                          accept="image/*,.pdf,application/pdf"
                          disabled={lendoNotaAbast || createAbast.isPending}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) lerNotaAbast(f); e.target.value = ""; }}
                          className="h-9 text-xs"
                        />
                        {lendoNotaAbast && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
                      </div>
                      {lendoNotaAbast && <p className="text-[11px] text-muted-foreground">Lendo nota com IA, aguarde...</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1 col-span-2"><Label>Veículo *</Label>
                        <Select value={fA.veiculo_id ?? ""} onValueChange={(v) => {
                          const veic = (veiculos as any[]).find((x) => x.id === v);
                          setFA({ ...fA, veiculo_id: v, tipo_combustivel: veic?.combustivel_padrao ?? fA.tipo_combustivel });
                        }}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{(veiculos as any[]).map((v) => <SelectItem key={v.id} value={v.id}>{v.placa} — {v.modelo}</SelectItem>)}</SelectContent></Select>
                      </div>
                      <div className="space-y-1 col-span-2"><Label>Motorista</Label>
                        <Select value={fA.motorista_id ?? "none"} onValueChange={(v) => setFA({ ...fA, motorista_id: v === "none" ? null : v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{(motoristas as any[]).filter((m) => m.status === "ativo").map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent></Select>
                      </div>
                      <div className="space-y-1"><Label>Data *</Label><Input type="date" required value={fA.data ?? new Date().toISOString().slice(0, 10)} onChange={(e) => setFA({ ...fA, data: e.target.value })} /></div>
                      <div className="space-y-1"><Label>Odômetro *</Label><Input type="number" required value={fA.odometro ?? ""} onChange={(e) => setFA({ ...fA, odometro: Number(e.target.value) })} /></div>
                      <div className="space-y-1"><Label>Litros *</Label><Input type="number" step="0.01" required value={fA.litros ?? ""} onChange={(e) => setFA({ ...fA, litros: e.target.value })} /></div>
                      <div className="space-y-1"><Label>Combustível</Label>
                        <Select value={fA.tipo_combustivel} onValueChange={(v) => setFA({ ...fA, tipo_combustivel: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPOS_COMBUSTIVEL.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
                      </div>
                      <div className="space-y-1"><Label>Valor por litro *</Label><Input type="number" step="0.01" required value={fA.valor_por_litro ?? ""} onChange={(e) => setFA({ ...fA, valor_por_litro: e.target.value })} /></div>
                      <div className="space-y-1"><Label>Total (auto)</Label><Input disabled value={fA.litros && fA.valor_por_litro ? (Number(fA.litros) * Number(fA.valor_por_litro)).toFixed(2) : ""} placeholder="litros × R$/L" /></div>
                      <div className="space-y-1 col-span-2"><Label>Posto</Label><Input value={fA.posto ?? ""} onChange={(e) => setFA({ ...fA, posto: e.target.value })} /></div>
                      <div className="space-y-1 col-span-2">
                        <Label>Anexo da nota / cupom fiscal (imagem ou PDF)</Label>
                        {abastComprovante ? (
                          <div className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
                            <span className="flex items-center gap-1.5 truncate"><Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{abastComprovante.name}</span><span className="text-muted-foreground shrink-0">({(abastComprovante.size / 1024).toFixed(0)} KB)</span></span>
                            <Button type="button" size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setAbastComprovante(null)}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        ) : (
                          <Input
                            type="file"
                            accept="image/*,.pdf,application/pdf"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) setAbastComprovante(f); e.target.value = ""; }}
                            className="h-9 text-xs"
                          />
                        )}
                      </div>
                    </div>
                    <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            <Button variant="outline" size="sm" onClick={() => exportAbast("csv")}><FileDown className="h-4 w-4" /> CSV</Button>
            <Button variant="outline" size="sm" onClick={() => exportAbast("pdf")}><FileText className="h-4 w-4" /> PDF</Button>
          </div>
          <Card>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr><th className="text-left p-2">Data</th><th className="text-left p-2">Veículo</th><th className="text-left p-2">Motorista</th><th className="text-right p-2">Odômetro</th><th className="text-right p-2">Litros</th><th className="text-right p-2">R$/L</th><th className="text-right p-2">Total</th><th className="text-right p-2">km/L</th><th className="text-right p-2">R$/km</th><th className="p-2"></th></tr>
                </thead>
                <tbody>
                  {(() => {
                    const byVeic = new Map<string, any[]>();
                    for (const a of [...(abastecimentos as any[])].sort((x, y) => x.data.localeCompare(y.data) || x.odometro - y.odometro)) {
                      const arr = byVeic.get(a.veiculo_id) ?? [];
                      arr.push(a);
                      byVeic.set(a.veiculo_id, arr);
                    }
                    return (abastecimentos as any[])
                      .filter((a) => !search || `${a.veiculo?.placa} ${a.motorista?.nome ?? ""} ${a.tipo_combustivel}`.toLowerCase().includes(search.toLowerCase()))
                      .map((a) => {
                        const list = byVeic.get(a.veiculo_id) ?? [];
                        const idx = list.findIndex((x) => x.id === a.id);
                        const prev = idx > 0 ? list[idx - 1] : null;
                        const { kmRodados, mediaKml, custoPorKm } = calcLinhaConsumo(a, prev);
                        return (
                          <tr key={a.id} className="border-t">
                            <td className="p-2 whitespace-nowrap">{a.data}</td>
                            <td className="p-2">{a.veiculo?.placa ?? "—"} <span className="text-muted-foreground text-xs">{a.veiculo?.modelo}</span></td>
                            <td className="p-2">{a.motorista?.nome ?? "—"}</td>
                            <td className="p-2 text-right">{Number(a.odometro).toLocaleString("pt-BR")} {kmRodados != null && <span className="text-xs text-muted-foreground">(+{kmRodados})</span>}</td>
                            <td className="p-2 text-right">{Number(a.litros).toFixed(2)}</td>
                            <td className="p-2 text-right">{formatCurrency(a.valor_por_litro)}</td>
                            <td className="p-2 text-right font-medium">{formatCurrency(a.valor_total)}</td>
                            <td className="p-2 text-right">{mediaKml != null ? <Badge variant={mediaKml < 6 ? "destructive" : mediaKml < 9 ? "secondary" : "default"}>{mediaKml.toFixed(2)}</Badge> : "—"}</td>
                            <td className="p-2 text-right">{custoPorKm != null ? formatCurrency(custoPorKm) : "—"}</td>
                            <td className="p-2 text-right whitespace-nowrap">
                              {a.comprovante_url && <Button size="icon" variant="ghost" title="Abrir nota/cupom anexado" onClick={() => abrirComprovanteAbast(a.comprovante_url)}><Paperclip className="h-3.5 w-3.5" /></Button>}
                              {canDelete && <Button size="icon" variant="ghost" onClick={() => confirm("Excluir?") && removeAbast.mutate(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                            </td>
                          </tr>
                        );
                      });
                  })()}
                </tbody>
              </table>
              {(abastecimentos as any[]).length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum abastecimento.</p>}
            </div>
          </Card>
        </TabsContent>

        {/* MANUTENÇÕES */}
        <TabsContent value="manutencao" className="space-y-3 mt-4">
          <div className="flex gap-2">
            {canEdit && (
              <Dialog open={openM} onOpenChange={setOpenM}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Nova manutenção</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Registrar manutenção</DialogTitle></DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); createManut.mutate(); }} className="space-y-3">
                    <div className="space-y-1"><Label>Veículo *</Label>
                      <Select value={fM.veiculo_id ?? ""} onValueChange={(v) => setFM({ ...fM, veiculo_id: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{(veiculos as any[]).map((v) => <SelectItem key={v.id} value={v.id}>{v.placa} — {v.modelo}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label>Tipo</Label><Select value={fM.tipo} onValueChange={(v) => setFM({ ...fM, tipo: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="preventiva">Preventiva</SelectItem><SelectItem value="corretiva">Corretiva</SelectItem></SelectContent></Select></div>
                      <div className="space-y-1"><Label>Serviço *</Label><Select value={fM.servico} onValueChange={(v) => setFM({ ...fM, servico: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPOS_SERVICO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-1"><Label>Data</Label><Input type="date" value={fM.data ?? new Date().toISOString().slice(0, 10)} onChange={(e) => setFM({ ...fM, data: e.target.value })} /></div>
                      <div className="space-y-1"><Label>Odômetro</Label><Input type="number" value={fM.odometro ?? ""} onChange={(e) => setFM({ ...fM, odometro: e.target.value ? Number(e.target.value) : null })} /></div>
                      <div className="space-y-1"><Label>Oficina</Label><Input value={fM.oficina ?? ""} onChange={(e) => setFM({ ...fM, oficina: e.target.value })} /></div>
                      <div className="space-y-1"><Label>Peças trocadas</Label><Input value={fM.pecas_trocadas ?? ""} onChange={(e) => setFM({ ...fM, pecas_trocadas: e.target.value })} /></div>
                      <div className="space-y-1"><Label>Mão de obra (R$)</Label><Input type="number" step="0.01" value={fM.valor_mao_obra ?? ""} onChange={(e) => setFM({ ...fM, valor_mao_obra: e.target.value })} /></div>
                      <div className="space-y-1"><Label>Peças (R$)</Label><Input type="number" step="0.01" value={fM.valor_pecas ?? ""} onChange={(e) => setFM({ ...fM, valor_pecas: e.target.value })} /></div>
                      <div className="space-y-1"><Label>Próx. revisão (km)</Label><Input type="number" value={fM.proxima_revisao_km ?? ""} onChange={(e) => setFM({ ...fM, proxima_revisao_km: e.target.value ? Number(e.target.value) : null })} /></div>
                      <div className="space-y-1"><Label>Próx. revisão (data)</Label><Input type="date" value={fM.proxima_revisao_data ?? ""} onChange={(e) => setFM({ ...fM, proxima_revisao_data: e.target.value || null })} /></div>
                    </div>
                    <div className="space-y-1"><Label>Observações</Label><Textarea value={fM.observacoes ?? ""} onChange={(e) => setFM({ ...fM, observacoes: e.target.value })} /></div>
                    <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <div className="grid gap-2">
            {(manutencoes as any[])
              .filter((m) => !search || `${m.veiculo?.placa} ${m.servico} ${m.oficina ?? ""}`.toLowerCase().includes(search.toLowerCase()))
              .map((m) => {
                const total = Number(m.valor_total ?? 0);
                return (
                  <Card key={m.id} className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{m.veiculo?.placa} — {m.servico} <Badge variant={m.tipo === "preventiva" ? "secondary" : "destructive"} className="ml-1">{m.tipo}</Badge></p>
                        <p className="text-xs text-muted-foreground">{m.data} {m.odometro ? `· ${Number(m.odometro).toLocaleString("pt-BR")} km` : ""} {m.oficina ? `· ${m.oficina}` : ""} {m.pecas_trocadas ? `· ${m.pecas_trocadas}` : ""}</p>
                        {m.proxima_revisao_km || m.proxima_revisao_data ? (
                          <p className="text-xs text-amber-600">Próx: {m.proxima_revisao_km ? `${Number(m.proxima_revisao_km).toLocaleString("pt-BR")} km` : ""} {m.proxima_revisao_data ? `· ${m.proxima_revisao_data}` : ""}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{formatCurrency(total)}</span>
                      {canDelete && <Button size="icon" variant="ghost" onClick={() => confirm("Excluir?") && removeManut.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </Card>
                );
              })}
            {(manutencoes as any[]).length === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhuma manutenção.</Card>}
          </div>
        </TabsContent>

        {/* GASTOS AVULSOS */}
        <TabsContent value="gastos" className="space-y-3 mt-4">
          <div className="flex gap-2">
            {canEdit && (
              <Dialog open={openG} onOpenChange={setOpenG}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Novo gasto</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Novo gasto avulso</DialogTitle></DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); createGasto.mutate(); }} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label>Data</Label><Input type="date" value={fG.data ?? new Date().toISOString().slice(0, 10)} onChange={(e) => setFG({ ...fG, data: e.target.value })} /></div>
                      <div className="space-y-1"><Label>Categoria *</Label><Select value={fG.categoria} onValueChange={(v) => setFG({ ...fG, categoria: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIAS_GASTO.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-1"><Label>Veículo (opcional)</Label><Select value={fG.veiculo_id ?? "none"} onValueChange={(v) => setFG({ ...fG, veiculo_id: v === "none" ? null : v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{(veiculos as any[]).map((v) => <SelectItem key={v.id} value={v.id}>{v.placa} — {v.modelo}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-1"><Label>Motorista</Label><Select value={fG.motorista_id ?? "none"} onValueChange={(v) => setFG({ ...fG, motorista_id: v === "none" ? null : v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{(motoristas as any[]).map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-1 col-span-2"><Label>Descrição *</Label><Input required value={fG.descricao ?? ""} onChange={(e) => setFG({ ...fG, descricao: e.target.value })} placeholder="Ex: Lavagem completa" /></div>
                      <div className="space-y-1"><Label>Valor *</Label><Input type="number" step="0.01" required value={fG.valor ?? ""} onChange={(e) => setFG({ ...fG, valor: e.target.value })} /></div>
                      <div className="space-y-1"><Label>Forma pagamento</Label><Input value={fG.forma_pagamento ?? ""} onChange={(e) => setFG({ ...fG, forma_pagamento: e.target.value })} placeholder="pix, cartão..." /></div>
                    </div>
                    <div className="space-y-1"><Label>Observações</Label><Textarea value={fG.observacoes ?? ""} onChange={(e) => setFG({ ...fG, observacoes: e.target.value })} /></div>
                    <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <div className="grid gap-2">
            {(gastos as any[])
              .filter((g) => !search || `${g.categoria} ${g.descricao} ${g.veiculo?.placa ?? ""}`.toLowerCase().includes(search.toLowerCase()))
              .map((g) => (
                <Card key={g.id} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{g.descricao} <Badge variant="outline">{g.categoria}</Badge></p>
                    <p className="text-xs text-muted-foreground">{g.data} {g.veiculo?.placa ? `· ${g.veiculo.placa}` : ""} {g.motorista?.nome ? `· ${g.motorista.nome}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2"><span className="text-sm font-bold">{formatCurrency(g.valor)}</span>{canDelete && <Button size="icon" variant="ghost" onClick={() => confirm("Excluir?") && removeGasto.mutate(g.id)}><Trash2 className="h-4 w-4" /></Button>}</div>
                </Card>
              ))}
            {(gastos as any[]).length === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhum gasto avulso.</Card>}
          </div>
        </TabsContent>

        {/* PEDÁGIOS */}
        <TabsContent value="pedagios" className="space-y-3 mt-4">
          <div className="flex flex-wrap gap-2 items-center">
            {canEdit && (
              <Dialog open={openP} onOpenChange={setOpenP}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Novo pedágio</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Novo pedágio</DialogTitle></DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); createPedagio.mutate(); }} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1 col-span-2"><Label>Veículo *</Label><Select value={fP.veiculo_id ?? ""} onValueChange={(v) => setFP({ ...fP, veiculo_id: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{(veiculos as any[]).map((v) => <SelectItem key={v.id} value={v.id}>{v.placa} — {v.modelo}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-1"><Label>Motorista</Label><Select value={fP.motorista_id ?? "none"} onValueChange={(v) => setFP({ ...fP, motorista_id: v === "none" ? null : v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{(motoristas as any[]).map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-1"><Label>Data/Hora *</Label><Input type="datetime-local" required value={fP.data_hora ? fP.data_hora.slice(0, 16) : new Date().toISOString().slice(0, 16)} onChange={(e) => setFP({ ...fP, data_hora: new Date(e.target.value).toISOString() })} /></div>
                      <div className="space-y-1"><Label>Rota / Rodovia</Label><Input value={fP.rota ?? ""} onChange={(e) => setFP({ ...fP, rota: e.target.value })} placeholder="Ex: BR-116" /></div>
                      <div className="space-y-1"><Label>Praça *</Label><Input required value={fP.praca ?? ""} onChange={(e) => setFP({ ...fP, praca: e.target.value })} placeholder="Ex: São Paulo - km 42" /></div>
                      <div className="space-y-1"><Label>Valor *</Label><Input type="number" step="0.01" required value={fP.valor ?? ""} onChange={(e) => setFP({ ...fP, valor: e.target.value })} /></div>
                      <div className="space-y-1"><Label>Pagamento</Label><Select value={fP.forma_pagamento} onValueChange={(v) => setFP({ ...fP, forma_pagamento: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tag">Tag automática</SelectItem><SelectItem value="dinheiro">Dinheiro</SelectItem><SelectItem value="cartao">Cartão</SelectItem><SelectItem value="pix">PIX</SelectItem></SelectContent></Select></div>
                      {fP.forma_pagamento === "tag" && <div className="space-y-1"><Label>Operadora</Label><Select value={fP.tag_operadora} onValueChange={(v) => setFP({ ...fP, tag_operadora: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{OPERADORAS_TAG.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>}
                    </div>
                    <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleImportPedagio} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Importar CSV (Sem Parar/ConectCar/Veloe)</Button>
            <span className="text-xs text-muted-foreground">CSV com colunas: data, praça, valor, rota, placa (opcional)</span>
          </div>
          <Card>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs"><tr><th className="text-left p-2">Data/Hora</th><th className="text-left p-2">Veículo</th><th className="text-left p-2">Motorista</th><th className="text-left p-2">Praça</th><th className="text-left p-2">Rota</th><th className="text-right p-2">Valor</th><th className="text-left p-2">Pagamento</th><th className="p-2"></th></tr></thead>
                <tbody>
                  {(pedagios as any[])
                    .filter((p) => !search || `${p.praca} ${p.rota ?? ""} ${p.veiculo?.placa ?? ""}`.toLowerCase().includes(search.toLowerCase()))
                    .map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="p-2 whitespace-nowrap">{new Date(p.data_hora).toLocaleString("pt-BR")}</td>
                        <td className="p-2">{p.veiculo?.placa ?? "—"}</td>
                        <td className="p-2">{p.motorista?.nome ?? "—"}</td>
                        <td className="p-2">{p.praca}</td>
                        <td className="p-2">{p.rota ?? "—"}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(p.valor)}</td>
                        <td className="p-2"><Badge variant="outline">{p.forma_pagamento}{p.tag_operadora ? ` · ${p.tag_operadora}` : ""}</Badge></td>
                        <td className="p-2 text-right">{canDelete && <Button size="icon" variant="ghost" onClick={() => confirm("Excluir?") && removePedagio.mutate(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {(pedagios as any[]).length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum pedágio. Use o botão Importar CSV para carregar extratos de tag.</p>}
            </div>
          </Card>
        </TabsContent>

        {/* MOTORISTAS */}
        <TabsContent value="motoristas" className="space-y-4 mt-4">
          <div className="flex gap-2 flex-wrap">
            {canEdit && (
              <Dialog open={openMot} onOpenChange={(o) => { setOpenMot(o); if (!o) { setFMot({ cnh_categoria: "B", status: "ativo" }); setEditMotId(null); } }}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Novo motorista</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{editMotId ? "Editar motorista" : "Novo motorista"}</DialogTitle></DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); saveMotorista.mutate(); }} className="space-y-3">
                    <div className="space-y-1"><Label>Nome completo *</Label><Input required value={fMot.nome ?? ""} onChange={(e) => setFMot({ ...fMot, nome: e.target.value })} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label>CPF</Label><Input value={fMot.cpf ?? ""} onChange={(e) => setFMot({ ...fMot, cpf: e.target.value })} placeholder="000.000.000-00" /></div>
                      <div className="space-y-1"><Label>CNH nº</Label><Input value={fMot.cnh_numero ?? ""} onChange={(e) => setFMot({ ...fMot, cnh_numero: e.target.value })} /></div>
                      <div className="space-y-1"><Label>Categoria CNH</Label><Select value={fMot.cnh_categoria} onValueChange={(v) => setFMot({ ...fMot, cnh_categoria: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="A">A</SelectItem><SelectItem value="B">B</SelectItem><SelectItem value="C">C</SelectItem><SelectItem value="D">D</SelectItem><SelectItem value="E">E</SelectItem><SelectItem value="AB">AB</SelectItem><SelectItem value="AC">AC</SelectItem><SelectItem value="AD">AD</SelectItem><SelectItem value="AE">AE</SelectItem></SelectContent></Select></div>
                      <div className="space-y-1"><Label>Vencimento CNH</Label><Input type="date" value={fMot.cnh_validade ?? ""} onChange={(e) => setFMot({ ...fMot, cnh_validade: e.target.value || null })} /></div>
                      <div className="space-y-1"><Label>Telefone</Label><Input value={fMot.telefone ?? ""} onChange={(e) => setFMot({ ...fMot, telefone: e.target.value })} /></div>
                      <div className="space-y-1"><Label>Status</Label><Select value={fMot.status} onValueChange={(v) => setFMot({ ...fMot, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem><SelectItem value="afastado">Afastado</SelectItem></SelectContent></Select></div>
                    </div>
                    <div className="space-y-1"><Label>Observações</Label><Textarea value={fMot.observacoes ?? ""} onChange={(e) => setFMot({ ...fMot, observacoes: e.target.value })} /></div>
                    <DialogFooter><Button type="submit">{editMotId ? "Atualizar" : "Cadastrar"}</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {/* Ranking sempre visível */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" /> Ranking de Eficiência</CardTitle><CardDescription className="text-xs">Ordenado por maior km/L; desempate por menor custo total. Mostra vínculo real entre motorista e abastecimentos.</CardDescription></CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs"><tr><th className="p-2 text-left">#</th><th className="p-2 text-left">Motorista</th><th className="p-2 text-left">CNH</th><th className="p-2 text-right">Abastec.</th><th className="p-2 text-right">km/L</th><th className="p-2 text-right">Combustível</th><th className="p-2 text-right">Avulsos</th><th className="p-2 text-right">Pedágios</th><th className="p-2 text-right">Total</th></tr></thead>
                  <tbody>
                    {ranking
                      .filter((r) => !search || r.motorista.nome.toLowerCase().includes(search.toLowerCase()))
                      .map((r, idx) => {
                        const s = statusCNH(r.motorista.cnh_validade);
                        return (
                          <tr key={r.motorista.id} className="border-t">
                            <td className="p-2 font-bold">{idx + 1}</td>
                            <td className="p-2 font-medium">{r.motorista.nome} <Badge variant={r.motorista.status === "ativo" ? "default" : "secondary"} className="ml-1 text-[10px]">{r.motorista.status}</Badge></td>
                            <td className="p-2"><Badge variant={s.nivel === "vencido" ? "destructive" : s.nivel === "atencao" ? "secondary" : "outline"}>{r.motorista.cnh_categoria} · {s.label}</Badge></td>
                            <td className="p-2 text-right">{r.totalAbast}</td>
                            <td className="p-2 text-right">{r.mediaKml != null ? `${r.mediaKml.toFixed(2)}` : "—"}</td>
                            <td className="p-2 text-right">{formatCurrency(r.gastoComb)}</td>
                            <td className="p-2 text-right">{formatCurrency(r.gastoAvulso)}</td>
                            <td className="p-2 text-right">{formatCurrency(r.gastoPedagio)}</td>
                            <td className="p-2 text-right font-bold">{formatCurrency(r.gastoTotal)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                {ranking.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Cadastre motoristas e abastecimentos para ver o ranking.</p>}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(motoristas as any[])
              .filter((m) => !search || `${m.nome} ${m.cpf ?? ""}`.toLowerCase().includes(search.toLowerCase()))
              .map((m) => {
                const s = statusCNH(m.cnh_validade);
                return (
                  <Card key={m.id} className={`p-4 ${s.nivel === "vencido" ? "border-rose-300" : s.nivel === "atencao" ? "border-amber-300" : ""}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium flex items-center gap-2">{m.nome} <Badge variant={m.status === "ativo" ? "default" : "secondary"}>{m.status}</Badge></p>
                        <p className="text-xs text-muted-foreground mt-1">CNH {m.cnh_categoria} {m.cnh_numero ? `· ${m.cnh_numero}` : ""}</p>
                        <p className={`text-xs mt-1 ${s.nivel === "vencido" ? "text-rose-600 font-semibold" : s.nivel === "atencao" ? "text-amber-600" : "text-muted-foreground"}`}>{s.nivel === "vencido" || s.nivel === "atencao" ? <AlertTriangle className="h-3 w-3 inline mr-1" /> : null}{s.label}</p>
                        {m.cpf && <p className="text-xs text-muted-foreground">CPF: {m.cpf}</p>}
                      </div>
                      <div className="flex gap-1">
                        {canEdit && <Button size="icon" variant="ghost" onClick={() => { setEditMotId(m.id); setFMot({ nome: m.nome, cpf: m.cpf, cnh_numero: m.cnh_numero, cnh_categoria: m.cnh_categoria, cnh_validade: m.cnh_validade, telefone: m.telefone, status: m.status, observacoes: m.observacoes }); setOpenMot(true); }}><PenLine className="h-4 w-4" /></Button>}
                        {canDelete && <Button size="icon" variant="ghost" onClick={() => confirm("Excluir motorista?") && removeMotorista.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button>}
                      </div>
                    </div>
                  </Card>
                );
              })}
            {(motoristas as any[]).length === 0 && <Card className="p-8 text-center text-muted-foreground md:col-span-3">Nenhum motorista cadastrado.</Card>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
