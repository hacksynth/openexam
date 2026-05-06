"use client";

import {
  Children,
  isValidElement,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";

type PixelSelectProps = {
  children: ReactNode;
  className?: string;
  defaultValue?: string;
  name: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
};

type PixelSelectOption = {
  disabled: boolean;
  label: string;
  value: string;
};

type OptionProps = {
  children?: ReactNode;
  disabled?: boolean;
  value?: string | number;
};

export function PixelSelect({ children, className = "", defaultValue, name, onValueChange, required = false }: PixelSelectProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const typeaheadRef = useRef<{ query: string; timeout: ReturnType<typeof setTimeout> | null }>({ query: "", timeout: null });
  const options = useMemo(() => getOptions(children), [children]);
  const initialValue = defaultValue ?? options.find((option) => !option.disabled)?.value ?? "";
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((option) => option.value === initialValue)));
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const activeOption = options[activeIndex];

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }

      setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  useEffect(() => {
    const existingOption = options.find((option) => option.value === value);

    if (existingOption && !existingOption.disabled) {
      return;
    }

    const fallbackValue = defaultValue ?? options.find((option) => !option.disabled)?.value ?? "";
    const fallbackIndex = options.findIndex((option) => option.value === fallbackValue);

    setValue(fallbackValue);
    setActiveIndex(Math.max(0, fallbackIndex));
  }, [defaultValue, options, value]);

  useEffect(() => {
    return () => {
      if (typeaheadRef.current.timeout) {
        clearTimeout(typeaheadRef.current.timeout);
      }
    };
  }, []);

  function selectOption(option: PixelSelectOption, index: number) {
    if (option.disabled) {
      return;
    }

    setValue(option.value);
    onValueChange?.(option.value);
    setActiveIndex(index);
    setOpen(false);
  }

  function moveActive(direction: 1 | -1) {
    if (options.length === 0) {
      return;
    }

    let nextIndex = activeIndex;

    for (let step = 0; step < options.length; step += 1) {
      nextIndex = (nextIndex + direction + options.length) % options.length;

      if (!options[nextIndex]?.disabled) {
        setActiveIndex(nextIndex);
        return;
      }
    }
  }

  function searchOptions(key: string) {
    if (typeaheadRef.current.timeout) {
      clearTimeout(typeaheadRef.current.timeout);
    }

    const query = `${typeaheadRef.current.query}${key.toLocaleLowerCase()}`;
    typeaheadRef.current.query = query;
    typeaheadRef.current.timeout = setTimeout(() => {
      typeaheadRef.current.query = "";
      typeaheadRef.current.timeout = null;
    }, 700);

    const matchIndex = findMatchingOption(options, query, activeIndex);

    if (matchIndex >= 0) {
      setOpen(true);
      setActiveIndex(matchIndex);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      moveActive(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      moveActive(-1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(Math.max(0, options.findIndex((option) => !option.disabled)));
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(Math.max(0, findLastEnabledIndex(options)));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();

      if (open && activeOption) {
        selectOption(activeOption, activeIndex);
        return;
      }

      setOpen(true);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      searchOptions(event.key);
    }
  }

  return (
    <div className="pixel-select" ref={rootRef}>
      <input name={name} type="hidden" value={value} />
      <button
        aria-activedescendant={open && activeOption ? `${id}-option-${activeIndex}` : undefined}
        aria-controls={`${id}-menu`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={required && !value ? true : undefined}
        className={`${className} pixel-select-trigger`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        type="button"
      >
        <span className="pixel-select-label">{selectedOption?.label ?? ""}</span>
      </button>
      {open ? (
        <div className="pixel-select-menu" id={`${id}-menu`} role="listbox">
          {options.map((option, index) => (
            <button
              aria-disabled={option.disabled || undefined}
              aria-selected={option.value === value}
              className="pixel-select-option"
              data-active={index === activeIndex || undefined}
              data-disabled={option.disabled || undefined}
              data-value={option.value}
              id={`${id}-option-${index}`}
              key={`${option.value}-${index}`}
              onClick={() => selectOption(option, index)}
              onMouseEnter={() => setActiveIndex(index)}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              role="option"
              tabIndex={-1}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getOptions(children: ReactNode): PixelSelectOption[] {
  return Children.toArray(children)
    .filter((child): child is ReactElement<OptionProps> => isValidElement<OptionProps>(child))
    .map((child) => {
      const label = getLabel(child.props.children);
      const value = child.props.value == null ? label : String(child.props.value);

      return {
        disabled: Boolean(child.props.disabled),
        label,
        value
      };
    });
}

function getLabel(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getLabel).join("");
  }

  return "";
}

function findLastEnabledIndex(options: PixelSelectOption[]) {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index]?.disabled) {
      return index;
    }
  }

  return -1;
}

function findMatchingOption(options: PixelSelectOption[], query: string, activeIndex: number) {
  if (!query) {
    return -1;
  }

  const normalizedQuery = query.toLocaleLowerCase();

  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (activeIndex + offset) % options.length;
    const option = options[index];

    if (!option || option.disabled) {
      continue;
    }

    if (option.label.toLocaleLowerCase().startsWith(normalizedQuery)) {
      return index;
    }
  }

  return -1;
}
