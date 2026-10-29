import React from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { THEME } from "../../constants/theme";
import { makeStyles, useTheme } from "../../hooks/useTheme";

export function SettingsSection({ title, children }: { title?: string; children: React.ReactNode }) {
  const styles = useStyles();
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
  const styles = useStyles();
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
  const { colors } = useTheme();
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
          thumbColor={value ? colors.accent : colors.switchThumbOff}
          trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
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
  const styles = useStyles();
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
  const styles = useStyles();
  return <Text style={styles.note}>{children}</Text>;
}

const useStyles = makeStyles((colors) => ({
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: colors.textTertiary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderTopColor: colors.border,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: colors.textPrimary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.body,
  },
  rowDescription: {
    color: colors.textTertiary,
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
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  pickerOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 9,
  },
  pickerOptionSelected: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  pickerText: {
    color: colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 13,
  },
  pickerTextSelected: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  note: {
    color: colors.textTertiary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: THEME.typography.caption,
    lineHeight: 18,
  },
}));
