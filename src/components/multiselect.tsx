"use client";

import * as React from "react";
import type { GroupBase, StylesConfig, ThemeConfig } from "react-select";
import Select, { Props as SelectProps } from "react-select";

// ───────────────────────────────────────────────
// shadcn-style theming for OKLCH variable system
// ───────────────────────────────────────────────

const shadcnSelectStyles = <
  Option,
  IsMulti extends boolean,
  Group extends GroupBase<Option>,
>(): StylesConfig<Option, IsMulti, Group> => ({
  control: (base, state) => ({
    ...base,
    backgroundColor: "var(--background)",
    borderColor: state.isFocused ? "var(--ring)" : "var(--input)",
    boxShadow: state.isFocused
      ? "0 0 0 2px color-mix(in srgb, var(--ring) 30%, transparent)"
      : "none",
    "&:hover": { borderColor: "var(--ring)" },
    minHeight: "2.5rem",
    borderRadius: "var(--radius)",
    fontSize: "0.875rem",
    cursor: "pointer",
    transition: "border-color 0.15s, box-shadow 0.15s",
  }),

  valueContainer: (base) => ({
    ...base,
    padding: "0 0.5rem",
    gap: "0.25rem",
  }),

  singleValue: (base) => ({
    ...base,
    color: "var(--foreground)",
  }),

  multiValue: (base) => ({
    ...base,
    backgroundColor: "var(--muted)",
    borderRadius: "9999px",
    paddingRight: "0.25rem",
  }),

  multiValueLabel: (base) => ({
    ...base,
    color: "var(--foreground)",
    fontSize: "0.875rem",
  }),

  multiValueRemove: (base) => ({
    ...base,
    color: "var(--muted-foreground)",
    borderRadius: "9999px",
    "&:hover": {
      backgroundColor:
        "color-mix(in srgb, var(--muted-foreground) 15%, transparent)",
      color: "var(--foreground)",
    },
  }),

  placeholder: (base) => ({
    ...base,
    color: "var(--muted-foreground)",
  }),

  dropdownIndicator: (base, state) => ({
    ...base,
    color: state.isFocused ? "var(--foreground)" : "var(--muted-foreground)",
    "&:hover": { color: "var(--foreground)" },
  }),

  indicatorSeparator: () => ({ display: "none" }),

  menu: (base) => ({
    ...base,
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    boxShadow:
      "0 4px 12px color-mix(in srgb, var(--foreground) 5%, transparent)",
    marginTop: "4px",
    zIndex: 50,
  }),

  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "var(--accent)"
      : state.isFocused
        ? "var(--muted)"
        : "transparent",
    color: state.isSelected ? "var(--accent-foreground)" : "var(--foreground)",
    cursor: "pointer",
    fontSize: "0.875rem",
  }),
});

const shadcnSelectTheme: ThemeConfig = (theme) => ({
  ...theme,
  borderRadius: 6,
  colors: {
    ...theme.colors,
    primary: "var(--primary)",
    primary25: "var(--muted)",
    primary50: "var(--muted)",
  },
});

// ───────────────────────────────────────────────
// Exported Multiselect (typed + OKLCH safe)
// ───────────────────────────────────────────────

export function Multiselect<
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>,
>(props: SelectProps<Option, IsMulti, Group>) {
  return (
    <Select
      {...props}
      classNamePrefix="shadcn"
      theme={shadcnSelectTheme}
      styles={shadcnSelectStyles<Option, IsMulti, Group>()}
    />
  );
}
