import type { ReactElement } from "react";
import { Text } from "react-native";

import { THEME } from "../constants/theme";
import { makeStyles } from "../hooks/useTheme";

type RedFlagHighlighterProps = {
  text: string;
  flags: string[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function RedFlagHighlighter({
  text,
  flags,
}: RedFlagHighlighterProps): ReactElement {
  const styles = useStyles();
  const normalizedFlags = Array.from(
    new Set(flags.map((flag) => flag.trim()).filter((flag) => flag.length > 0))
  );

  if (normalizedFlags.length === 0) {
    return <Text style={styles.baseText}>{text}</Text>;
  }

  const pattern = normalizedFlags
    .sort((a, b) => b.length - a.length)
    .map((flag) => escapeRegExp(flag))
    .join("|");

  if (!pattern) {
    return <Text style={styles.baseText}>{text}</Text>;
  }

  const regex = new RegExp(`(${pattern})`, "gi");
  const segments = text.split(regex);

  return (
    <Text style={styles.baseText}>
      {segments.map((segment, index) => {
        const isMatch = normalizedFlags.some(
          (flag) => flag.toLowerCase() === segment.toLowerCase()
        );

        if (isMatch) {
          return (
            <Text key={`${segment}-${index}`} style={styles.highlightedText}>
              {segment}
            </Text>
          );
        }

        return <Text key={`${segment}-${index}`}>{segment}</Text>;
      })}
    </Text>
  );
}

const useStyles = makeStyles((colors) => ({
  baseText: {
    fontFamily: THEME.fontFamily.dmSans,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  highlightedText: {
    backgroundColor: `${colors.statusBad}40`,
  },
}));