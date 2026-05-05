"use client";

import { Check, Clipboard } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type CopyKey = "blueprint" | "prompt" | "linkedin" | "dm";

export function ReportCopyActions({
  reportMarkdown,
  linkedinPost,
  dmScript,
}: {
  reportMarkdown: string;
  linkedinPost: string;
  dmScript: string;
}) {
  const [copied, setCopied] = useState<CopyKey | null>(null);
  const slices = useMemo(() => {
    const blueprint = extractCodexBlueprint(reportMarkdown);
    const prompt = extractCodexPrompt(reportMarkdown);

    return {
      blueprint,
      prompt,
      linkedin: linkedinPost,
      dm: dmScript,
    };
  }, [dmScript, linkedinPost, reportMarkdown]);

  async function copy(key: CopyKey) {
    await navigator.clipboard.writeText(slices[key]);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1400);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Copy Assets</CardTitle>
        <CardDescription>
          Grab the blueprint, implementation prompt, or sales copy directly from this report.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <CopyButton
          label="Codex Build Blueprint"
          copied={copied === "blueprint"}
          onClick={() => copy("blueprint")}
        />
        <CopyButton
          label="Codex Prompt"
          copied={copied === "prompt"}
          onClick={() => copy("prompt")}
        />
        <CopyButton
          label="LinkedIn Post"
          copied={copied === "linkedin"}
          onClick={() => copy("linkedin")}
        />
        <CopyButton
          label="DM Script"
          copied={copied === "dm"}
          onClick={() => copy("dm")}
        />
      </CardContent>
    </Card>
  );
}

function CopyButton({
  label,
  copied,
  onClick,
}: {
  label: string;
  copied: boolean;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="outline" onClick={onClick}>
      {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function extractCodexBlueprint(markdown: string) {
  const section = extractTopLevelSection(markdown, "Codex Build Blueprint");
  if (!section) {
    return "Codex Build Blueprint is not available in this report.";
  }

  return section.replace(/\n## Codex Prompt[\s\S]*$/i, "").trim();
}

function extractCodexPrompt(markdown: string) {
  const promptSection = extractSubsection(markdown, "Codex Prompt");
  const fenced = promptSection.match(/```(?:text)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }

  return promptSection.trim() || "Codex Prompt is not available in this report.";
}

function extractTopLevelSection(markdown: string, title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(^|\\n)#\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n#\\s+|$)`,
    "i",
  );
  const match = markdown.match(pattern);

  return match?.[2]?.trim() ?? "";
}

function extractSubsection(markdown: string, title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(^|\\n)##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n#{1,2}\\s+|$)`,
    "i",
  );
  const match = markdown.match(pattern);

  return match?.[2]?.trim() ?? "";
}
