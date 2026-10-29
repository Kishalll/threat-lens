import React from "react";
import { Pressable, ScrollView, Text } from "react-native";

import { THEME } from "../../constants/theme";
import { makeStyles } from "../../hooks/useTheme";
import { HISTORY_FILTERS, type HistoryFilter } from "../../utils/historyFilters";

interface HistoryFiltersProps {
  value: HistoryFilter;
  counts: Record<HistoryFilter, number>;
  onChange: (filter: HistoryFilter) => void;
}

// Chip row above the scan history. Scrolls sideways before the tabs swipe.
export default function HistoryFilters({ value, counts, onChange }: HistoryFiltersProps) {
  const styles = useStyles();

  return (
    // flexGrow 0: a sideways ScrollView otherwise fills the column and stretches its chips.
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroller}
      contentContainerStyle={styles.row}
    >
      {HISTORY_FILTERS.map((filter) => {
        const selected = filter.value === value;
        return (
          <Pressable
            key={filter.value}
            style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
            onPress={() => onChange(filter.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${filter.label}, ${counts[filter.value]}`}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{filter.label}</Text>
            <Text style={[styles.count, selected && styles.labelSelected]}>{counts[filter.value]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  scroller: {
    flexGrow: 0,
  },
  row: {
    alignItems: "center",
    gap: 8,
    paddingBottom: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: THEME.radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}1F`,
  },
  label: {
    color: colors.textSecondary,
    fontFamily: THEME.fontFamily.dmSans,
    fontSize: 13,
    fontWeight: "600",
  },
  labelSelected: {
    color: colors.accent,
  },
  count: {
    color: colors.textTertiary,
    fontFamily: THEME.fontFamily.jetbrainsMono,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.7,
  },
}));
