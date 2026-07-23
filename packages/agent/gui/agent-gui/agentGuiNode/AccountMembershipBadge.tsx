interface AccountMembershipBadgeProps {
  label: string;
  /**
   * Host-provided membership tier icon. Rendered inline before the label;
   * when absent the badge renders label text only.
   */
  iconUrl?: string | null;
  className?: string;
}

export function AccountMembershipBadge({
  label,
  iconUrl = null,
  className = ""
}: AccountMembershipBadgeProps): React.JSX.Element {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 text-[12px] font-semibold leading-4 text-[var(--text-secondary)] ${className}`}
      data-account-membership-badge="true"
    >
      {iconUrl ? (
        <img
          alt=""
          aria-hidden="true"
          draggable={false}
          src={iconUrl}
          className="size-3.5 shrink-0 object-contain"
        />
      ) : null}
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
