"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { defaultPresets } from "@/lib/data";
import { useToast, ToastContainer } from "@/hooks/useToast";

export default function SettingsPage() {
  const [profile, setProfile] = useState({ name: "HR Manager", email: "hr@company.com" });
  const [weights, setWeights] = useState({ technical: 25, experience: 25, projects: 25, culture: 25 });
  const [emailTemplate, setEmailTemplate] = useState(`Dear {{name}},\n\nWe were impressed by your background...`);
  const [integrations, setIntegrations] = useState({ googleDrive: true, email: false });
  const [activePreset, setActivePreset] = useState("1");
  const { toasts, toast, dismiss } = useToast();

  const totalWeight = weights.technical + weights.experience + weights.projects + weights.culture;

  const loadPreset = (preset: typeof defaultPresets[0]) => {
    setWeights({ technical: preset.technical, experience: preset.experience, projects: preset.projects, culture: preset.culture });
    setActivePreset(preset.id);
    toast({ title: `Loaded preset: ${preset.name}` });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      <h1 className="text-3xl font-bold">Settings</h1>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Manage your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg">HR</AvatarFallback>
            </Avatar>
            <Button variant="outline" size="sm">Change Avatar</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weight Presets */}
      <Card>
        <CardHeader>
          <CardTitle>Scoring Weights</CardTitle>
          <CardDescription>Configure default weight presets for candidate scoring</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {defaultPresets.map((preset) => (
              <Button
                key={preset.id}
                variant={activePreset === preset.id ? "default" : "outline"}
                size="sm"
                onClick={() => loadPreset(preset)}
              >
                {preset.name}
              </Button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Current Weights</h4>
            <Badge variant={totalWeight === 100 ? "default" : "destructive"}>Total: {totalWeight}%</Badge>
          </div>

          {[
            { key: "technical" as const, label: "Technical Skills" },
            { key: "experience" as const, label: "Experience" },
            { key: "projects" as const, label: "Project Relevance" },
            { key: "culture" as const, label: "Cultural Fit" },
          ].map(({ key, label }) => (
            <div key={key} className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>{label}</Label>
                <span className="font-medium">{weights[key]}%</span>
              </div>
              <Slider
                value={[weights[key]]}
                max={100}
                step={5}
                onValueChange={(v) => setWeights((prev) => ({ ...prev, [key]: v[0] }))}
              />
            </div>
          ))}

          <Button
            onClick={() => toast({ title: "Preset saved!" })}
            disabled={totalWeight !== 100}
          >
            Save as New Preset
          </Button>
        </CardContent>
      </Card>

      {/* Email Template */}
      <Card>
        <CardHeader>
          <CardTitle>Email Template</CardTitle>
          <CardDescription>Default template for interview invitation emails</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={emailTemplate}
            onChange={(e) => setEmailTemplate(e.target.value)}
            className="min-h-[200px]"
          />
          <div className="flex gap-2">
            <Badge variant="outline">{"{{name}}"}</Badge>
            <Badge variant="outline">{"{{role}}"}</Badge>
            <Badge variant="outline">{"{{company}}"}</Badge>
            <Badge variant="outline">{"{{date}}"}</Badge>
          </div>
          <Button onClick={() => toast({ title: "Template saved!" })}>Save Template</Button>
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>Manage connected services</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              <div>
                <p className="font-medium">Google Drive</p>
                <p className="text-sm text-muted-foreground">Import resumes from Drive</p>
              </div>
            </div>
            <Switch
              checked={integrations.googleDrive}
              onCheckedChange={(v) => setIntegrations((prev) => ({ ...prev, googleDrive: v }))}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              <div>
                <p className="font-medium">Email Provider</p>
                <p className="text-sm text-muted-foreground">Send emails via SMTP</p>
              </div>
            </div>
            <Switch
              checked={integrations.email}
              onCheckedChange={(v) => setIntegrations((prev) => ({ ...prev, email: v }))}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}