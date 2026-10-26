/**
 * `cn` — class name joiner.
 *
 * The vendored mapcn file imports this from `@/lib/utils`, matching the shadcn
 * convention. This project has no Tailwind, so most call sites were rewritten
 * to MUI `sx` props. The remaining ones keep passing plain CSS class names,
 * which is all this needs to do.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ');
}
