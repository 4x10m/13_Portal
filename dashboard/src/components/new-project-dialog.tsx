"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { CreateProjectInput } from "@/lib/db/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function NewProjectDialog({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateProjectInput>({
    name: "",
    description: "",
    status: "idea",
    priority: "medium",
    category: "general",
    assigned_agent: "",
    docker_containers: [],
    domains: [],
    databases: [],
    opencode_sessions: [],
  });
  const [containerInput, setContainerInput] = useState("");
  const [domainInput, setDomainInput] = useState("");

  const handleSubmit = async () => {
    if (!form.name?.trim()) return;
    try {
      await fetch("/api/roadmap/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({
        name: "", description: "", status: "idea", priority: "medium",
        category: "general", assigned_agent: "", docker_containers: [],
        domains: [], databases: [], opencode_sessions: [],
      });
      setContainerInput("");
      setDomainInput("");
      setOpen(false);
      toast.success("Projet créé");
      onCreated();
    } catch { toast.error("Erreur lors de la création du projet"); }
  };

  const addContainer = () => {
    const val = containerInput.trim();
    if (val && !form.docker_containers?.includes(val)) {
      setForm({ ...form, docker_containers: [...(form.docker_containers || []), val] });
      setContainerInput("");
    }
  };

  const removeContainer = (name: string) => {
    setForm({ ...form, docker_containers: form.docker_containers?.filter((c) => c !== name) });
  };

  const addDomain = () => {
    const val = domainInput.trim();
    if (val && !form.domains?.includes(val)) {
      setForm({ ...form, domains: [...(form.domains || []), val] });
      setDomainInput("");
    }
  };

  const removeDomain = (d: string) => {
    setForm({ ...form, domains: form.domains?.filter((x) => x !== d) });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>+ Nouveau projet</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau projet</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-4">
          <Input
            placeholder="Nom du projet"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Textarea
            placeholder="Description (optionnel)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-3">
            <Select
              value={form.priority}
              onValueChange={(v) =>
                setForm({ ...form, priority: v as CreateProjectInput["priority"] })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Priorité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Basse</SelectItem>
                <SelectItem value="medium">Moyenne</SelectItem>
                <SelectItem value="high">Haute</SelectItem>
                <SelectItem value="critical">Critique</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={form.category}
              onValueChange={(v) =>
                setForm({ ...form, category: v as CreateProjectInput["category"] })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">Général</SelectItem>
                <SelectItem value="infra">Infra</SelectItem>
                <SelectItem value="ai">IA</SelectItem>
                <SelectItem value="apps">Apps</SelectItem>
                <SelectItem value="perso">Perso</SelectItem>
                <SelectItem value="devops">DevOps</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={form.status}
              onValueChange={(v) =>
                setForm({ ...form, status: v as CreateProjectInput["status"] })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="idea">Idée</SelectItem>
                <SelectItem value="in-progress">En cours</SelectItem>
                <SelectItem value="on-hold">En pause</SelectItem>
                <SelectItem value="done">Terminé</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Docker containers */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">🐳 Conteneurs Docker</label>
            <div className="flex gap-2">
              <Input
                placeholder="nom-du-conteneur"
                value={containerInput}
                onChange={(e) => setContainerInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addContainer())}
                className="h-8 text-xs"
              />
              <Button variant="ghost" size="sm" className="h-8" onClick={addContainer}>+</Button>
            </div>
            {form.docker_containers?.length ? (
              <div className="flex flex-wrap gap-1">
                {form.docker_containers.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 text-[11px] bg-muted/50 px-1.5 py-0.5 rounded">
                    {c}
                    <button onClick={() => removeContainer(c)} className="text-muted-foreground hover:text-foreground">×</button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* Domains */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">🌐 Domaines</label>
            <div className="flex gap-2">
              <Input
                placeholder="sous-domaine.axiiomlab.ovh"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDomain())}
                className="h-8 text-xs"
              />
              <Button variant="ghost" size="sm" className="h-8" onClick={addDomain}>+</Button>
            </div>
            {form.domains?.length ? (
              <div className="flex flex-wrap gap-1">
                {form.domains.map((d) => (
                  <span key={d} className="inline-flex items-center gap-1 text-[11px] bg-muted/50 px-1.5 py-0.5 rounded">
                    {d}
                    <button onClick={() => removeDomain(d)} className="text-muted-foreground hover:text-foreground">×</button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <Button onClick={handleSubmit} className="w-full">
            Créer le projet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
