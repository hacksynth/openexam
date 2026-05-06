"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

type PixelDatePickerProps = {
  ariaLabel?: string;
  className?: string;
  defaultValue?: string;
  name: string;
  placeholder?: string;
  required?: boolean;
};

type CalendarDay = {
  date: Date;
  outside: boolean;
  value: string;
};

const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];

export function PixelDatePicker({
  ariaLabel,
  className = "",
  defaultValue = "",
  name,
  placeholder = "未设置日期",
  required = false
}: PixelDatePickerProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const initialValue = normalizeDateValue(defaultValue);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [viewDate, setViewDate] = useState(() => getInitialViewDate(initialValue));
  const monthDays = useMemo(() => getCalendarDays(viewDate), [viewDate]);
  const selectedDate = value ? parseDateValue(value) : null;
  const monthLabel = `${viewDate.getFullYear()} 年 ${viewDate.getMonth() + 1} 月`;

  useEffect(() => {
    const nextValue = normalizeDateValue(defaultValue);
    setValue(nextValue);
    setViewDate(getInitialViewDate(nextValue));
  }, [defaultValue]);

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

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function shiftMonth(offset: number) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function selectDate(nextValue: string) {
    setValue(nextValue);
    setViewDate(getInitialViewDate(nextValue));
    setOpen(false);
  }

  function selectToday() {
    selectDate(formatDateValue(new Date()));
  }

  return (
    <div className="pixel-date" ref={rootRef}>
      <input name={name} type="hidden" value={value} />
      <button
        aria-controls={`${id}-calendar`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-invalid={required && !value ? true : undefined}
        aria-label={ariaLabel}
        className={`${className} pixel-date-trigger`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className={value ? "pixel-date-value" : "pixel-date-placeholder"}>{value ? formatDisplayDate(value) : placeholder}</span>
        <span aria-hidden="true" className="pixel-date-icon" />
      </button>
      {open ? (
        <div aria-label={ariaLabel ?? "日期选择"} className="pixel-date-menu" id={`${id}-calendar`} role="dialog">
          <div className="pixel-date-toolbar">
            <button aria-label="上个月" className="pixel-date-nav" onClick={() => shiftMonth(-1)} type="button">
              &lt;
            </button>
            <p className="pixel-date-month">{monthLabel}</p>
            <button aria-label="下个月" className="pixel-date-nav" onClick={() => shiftMonth(1)} type="button">
              &gt;
            </button>
          </div>
          <div className="pixel-date-weekdays">
            {weekdayLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="pixel-date-grid">
            {monthDays.map((day) => {
              const isSelected = value === day.value;
              const isToday = day.value === formatDateValue(new Date());

              return (
                <button
                  aria-pressed={isSelected}
                  className="pixel-date-day"
                  data-outside={day.outside || undefined}
                  data-selected={isSelected || undefined}
                  data-today={isToday || undefined}
                  key={day.value}
                  onClick={() => selectDate(day.value)}
                  type="button"
                >
                  {day.date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="pixel-date-actions">
            <button className="pixel-date-action" onClick={selectToday} type="button">
              今天
            </button>
            <button className="pixel-date-action" disabled={required} onClick={() => setValue("")} type="button">
              清空
            </button>
          </div>
          {selectedDate ? <p className="pixel-date-current">已选 {selectedDate.getFullYear()}-{pad2(selectedDate.getMonth() + 1)}-{pad2(selectedDate.getDate())}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function getInitialViewDate(value: string) {
  const parsed = value ? parseDateValue(value) : null;
  const source = parsed ?? new Date();
  return new Date(source.getFullYear(), source.getMonth(), 1);
}

function getCalendarDays(viewDate: Date): CalendarDay[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(year, month, 1 - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index);
    return {
      date,
      outside: date.getMonth() !== month,
      value: formatDateValue(date)
    };
  });
}

function normalizeDateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "";
  }

  return parseDateValue(value) ? value : "";
}

function parseDateValue(value: string) {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(year, month - 1, day);

  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }

  return parsed;
}

function formatDisplayDate(value: string) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return value;
  }

  return `${parsed.getFullYear()} 年 ${parsed.getMonth() + 1} 月 ${parsed.getDate()} 日`;
}

function formatDateValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
