import React from "react";
import { View } from "react-native";

import { syncBreachCheckTask } from "../../services/backgroundTasks";
import { useSettingsStore } from "../../stores/settingsStore";
import type { AppSettings, BreachInterval } from "../../utils/settings";
import { OptionPicker, SettingsNote, SettingsSection, SettingsSwitch } from "../settings/SettingsControls";

const INTERVAL_OPTIONS: { value: BreachInterval; label: string }[] = [
  { value: 6, label: "6 h" },
  { value: 12, label: "12 h" },
  { value: 24, label: "24 h" },
];

export default function BreachSettings() {
  const breach = useSettingsStore((state) => state.settings.breach);
  const update = useSettingsStore((state) => state.update);

  const change = async (patch: Partial<AppSettings["breach"]>) => {
    await update("breach", patch);
    await syncBreachCheckTask(useSettingsStore.getState().settings.breach);
  };

  return (
    <>
      <SettingsSection>
        <SettingsSwitch
          first
          label="Background checks"
          description="Checks your monitored accounts while the app is closed"
          value={breach.backgroundChecks}
          onValueChange={(value) => void change({ backgroundChecks: value })}
        />
      </SettingsSection>

      <SettingsSection title="Check every">
        <View style={{ padding: 10, gap: 8 }}>
          <OptionPicker
            options={INTERVAL_OPTIONS}
            value={breach.intervalHours}
            onChange={(value) => void change({ intervalHours: value })}
            disabled={!breach.backgroundChecks}
          />
          <SettingsNote>Android may run it a little later to save battery.</SettingsNote>
        </View>
      </SettingsSection>

      <SettingsSection>
        <SettingsSwitch
          first
          label="Breach alerts"
          description="Notify me when a new breach is found"
          value={breach.alerts}
          onValueChange={(value) => void change({ alerts: value })}
        />
      </SettingsSection>
    </>
  );
}
