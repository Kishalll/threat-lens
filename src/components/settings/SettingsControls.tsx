import React from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { THEME } from "../../constants/theme";

export function SettingsSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

interface SettingsRowProps {
  label: string;
  description?: string;
  right?: React.ReactNode;
  disabled?: boolean;
  first?: boolean;
}

export function SettingsRow({ label, description, right, disabled, first }: SettingsRowProps) {
  return (
    <View style={[styles.row, !first && styles.rowDivider, disabled && styles.disabled]}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
      </View>
      {right}
    </View>
  );
}

interface SettingsSwitchProps extends Omit<SettingsRowProps, "right"> {
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function SettingsSwitch({ value, onValueChange, disabled, ...row }: SettingsSwitchProps) {
  return (
    <SettingsRow
      {...row}
      disabled={disabled}
      right={
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          accessibilityLabel={row.label}
          thumbColor={value ? THEME.colors.accent : "#B8BDC6"}
          trackColor={{ false: "#4A5160", true: "#2B7A5A" }}
        />
      }
    />
  );
}

interface OptionPickerProps<T extends string | number> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function OptionPicker<T extends string | number>({ options, value, onChange, disabled }: OptionPickerProps<T>) {
  return (
    <View style={[styles.picker, disabled && styles.disabled]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            style={[styles.pickerOption, selected && styles.pickerOptionSelected]}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
          >
            <Text style={[styles.pickerText, selected && styles.pickerTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SettingsNote({ children }: { children: React.ReactNode }) {
  return <Text style={styles.note}>{children}</Text>;
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: THEME.colors.textTertiary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sectionCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: THEME.colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.body,
  },
  rowDescription: {
    color: THEME.colors.textTertiary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.caption,
  },
  disabled: {
    opacity: 0.45,
  },
  picker: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.backgroundElevated,
  },
  pickerOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 9,
  },
  pickerOptionSelected: {
    backgroundColor: THEME.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: THEME.colors.borderStrong,
  },
  pickerText: {
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 13,
  },
  pickerTextSelected: {
    color: THEME.colors.textPrimary,
    fontWeight: "700",
  },
  note: {
    color: THEME.colors.textTertiary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.caption,
    lineHeight: 18,
  },
});
