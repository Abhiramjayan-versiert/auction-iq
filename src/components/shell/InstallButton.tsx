"use client";
import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/misc";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Installs AUCTION IQ as an app (PWA) on Windows, macOS, Linux, ChromeOS, Android and iOS/iPadOS.
 * Chromium browsers fire `beforeinstallprompt`; Safari/iOS users get step-by-step instructions.
 */
export function InstallButton({ compact }: { compact?: boolean }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    setInstalled(Boolean(standalone));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (installed) return null;
  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferred(null);
    } else setHelp(true);
  };
  return (
    <>
      <Button size="sm" variant={compact ? "ghost" : "secondary"} onClick={install} title="Install the app">
        <Download size={14} /> {compact ? "Install" : "Install app"}
      </Button>
      <Dialog open={help} onClose={() => setHelp(false)} title="Install AUCTION IQ">
        <div className="space-y-3 text-sm">
          <p className="text-muted">Install it like an app — it opens in its own window, works on phones and laptops, and updates automatically.</p>
          <div><b>iPhone / iPad (Safari):</b> tap <Share size={13} className="inline" /> <b>Share</b> → <b>Add to Home Screen</b>.</div>
          <div><b>Android (Chrome):</b> tap <b>⋮</b> → <b>Install app</b> (or <b>Add to Home screen</b>).</div>
          <div><b>Windows / Linux / ChromeOS (Chrome or Edge):</b> click the install icon in the address bar, or <b>⋮</b> → <b>Install AUCTION IQ</b>.</div>
          <div><b>Mac:</b> Chrome/Edge → install icon in the address bar; Safari (macOS 14+) → <b>File</b> → <b>Add to Dock</b>.</div>
        </div>
      </Dialog>
    </>
  );
}
