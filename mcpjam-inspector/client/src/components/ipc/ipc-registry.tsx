import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { X } from "lucide-react";

export type HeaderIpc = {
  id: string;
  render: (context: { dismiss: () => void }) => ReactNode;
};

// Append new IPC entries here. Use a new unique `id` so previously dismissed
// banners will not automatically reappear.
// AgntUX: upstream promotional banners removed for self-hosted deployment
export const headerIpcs: HeaderIpc[] = [];
