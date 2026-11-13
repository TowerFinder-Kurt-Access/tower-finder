// The MIT DataGrid rejects any pageSize above 100 at runtime, so every
// paginated grid clamps to this. Shared by the owner and tower grids.
export const MAX_PAGE_SIZE = 100;
export const PAGE_SIZE_OPTIONS = [25, 50, MAX_PAGE_SIZE];
