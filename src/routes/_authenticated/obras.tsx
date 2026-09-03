import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canManage, isAdmin, useUserRoles, useModulePerm } from "@/lib/permissions";
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
import { Plus, Trash2, MapPin, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/obras")({ component: ObrasPage });

function ObrasPage() {
  const qc = useQueryClient();
  const { data: roles } = useUserRoles();
  const perm = useModulePerm("obras");
  const canCreate = perm.can_edit;
  const canDelete = perm.can_delete;

  const { data: obras = [] } = useQuery({
    queryKey: ["obras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obras")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ status: "ativa" });

  const openNew = () => {
    setEditing(null);
    setForm({ status: "ativa" });
    setOpen(true);
  };
  const openEdit = (o: any) => {
    setEditing(o);
    setForm({ ...o });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: form.nome,
        endereco: form.endereco || null,
        status: form.status,
        observacoes: form.observacoes || null,
      };
      if (editing) {
        const { error } = await supabase.from("obras").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("obras").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Obra atualizada" : "Obra criada");
      qc.invalidateQueries({ queryKey: ["obras"] });
      setOpen(false);
      setForm({ status: "ativa" });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("obras").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removida");
      qc.invalidateQueries({ queryKey: ["obras"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Obras</h1>
          <p className="text-muted-foreground">Centros de custo e localizações das operações.</p>
        </div>
        {canCreate && (
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={openNew}>
                <Plus className="h-4 w-4" /> Nova obra
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar obra" : "Nova obra"}</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate();
                }}
                className="space-y-3"
              >
                <div className="space-y-1">
                  <Label>Nome *</Label>
                  <Input
                    required
                    value={form.nome ?? ""}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Endereço</Label>
                  <Input
                    value={form.endereco ?? ""}
                    onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativa">Ativa</SelectItem>
                      <SelectItem value="pausada">Pausada</SelectItem>
                      <SelectItem value="concluida">Concluída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Observações</Label>
                  <Textarea
                    value={form.observacoes ?? ""}
                    onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={save.isPending}>
                    {editing ? "Salvar" : "Criar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {obras.map((o: any) => (
          <Card key={o.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <h3 className="font-medium">{o.nome}</h3>
                </div>
                {o.endereco && <p className="text-sm text-muted-foreground mt-1">{o.endereco}</p>}
                {o.observacoes && (
                  <p className="text-xs text-muted-foreground mt-1">{o.observacoes}</p>
                )}
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-muted mt-2 inline-block">
                  {o.status}
                </span>
              </div>
              <div className="flex gap-1">
                {canCreate && (
                  <Button size="icon" variant="ghost" onClick={() => openEdit(o)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {canDelete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => confirm("Excluir?") && remove.mutate(o.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
        {obras.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground md:col-span-2 lg:col-span-3">
            Nenhuma obra cadastrada.
          </Card>
        )}
      </div>
    </div>
  );
}
