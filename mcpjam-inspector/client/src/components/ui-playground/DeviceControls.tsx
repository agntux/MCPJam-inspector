/**
 * DeviceControls
 *
 * Device emulation and theme controls for the UI Playground
 */

import { Smartphone, Tablet, Monitor } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import type { DeviceType } from "@/stores/ui-playground-store";

interface DeviceControlsProps {
  deviceType: DeviceType;
  onDeviceTypeChange: (type: DeviceType) => void;
}

// AgntUX: theme toggle removed — dark mode is always on
export function DeviceControls({
  deviceType,
  onDeviceTypeChange,
}: DeviceControlsProps) {
  return (
    <div className="px-4 py-3 border-t border-border bg-background flex-shrink-0">
      <div className="flex items-center justify-center gap-3">
        {/* Device Type */}
        <ToggleGroup
          type="single"
          value={deviceType}
          onValueChange={(v) => v && onDeviceTypeChange(v as DeviceType)}
          className="gap-0.5"
        >
          <ToggleGroupItem
            value="mobile"
            aria-label="Mobile"
            title="Mobile (430×932)"
            className="h-8 w-8 p-0"
          >
            <Smartphone className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="tablet"
            aria-label="Tablet"
            title="Tablet (820×1180)"
            className="h-8 w-8 p-0"
          >
            <Tablet className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="desktop"
            aria-label="Desktop"
            title="Desktop (1280×800)"
            className="h-8 w-8 p-0"
          >
            <Monitor className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}
