# Entity API Conventions

## Folder structure

Each entity's `api/` segment is split into four files:

```
entities/{domain}/api/
  keys.ts              ← query key constants
  {domain}.queries.ts  ← useQuery hooks (read operations)
  {domain}.mutations.ts ← useMutation hooks (write operations)
  {domain}.api.ts      ← barrel: re-exports everything above
```

`{domain}.api.ts` exists only for backward compatibility — new code should
import from the specific file directly.

## Naming conventions

| Operation | HTTP | Hook name |
|-----------|------|-----------|
| Fetch list | GET | `useGet{Resources}` |
| Fetch one | GET | `useGet{Resource}` |
| Create | POST | `usePost{Resource}` |
| Update | PATCH | `usePatch{Resource}` |
| Delete | DELETE | `useDelete{Resource}` |

Old names (e.g. `useCreateBook`, `useUpdateBook`) are kept as `@deprecated`
aliases pointing to the new name so existing callers keep compiling while
migrating.

## Query keys

Every entity has a `keys.ts` that exports its root key constant:

```ts
export const booksKey = ['books'] as const;
```

Derived keys are constructed inline (`[...booksKey, id]`). Cross-entity
invalidations (e.g. deleting a book also invalidates `['sentences']`) use the
other entity's root key literal directly — no cross-entity key imports.

## Where the logic lives

- **`keys.ts`** — constants only, no imports from react-query or the API client
- **`{domain}.queries.ts`** — `useQuery` hooks + data transformers (e.g. `toBook`)
  + derived hooks that compose other queries (e.g. `useTodayItem`, `useSentenceFeed`)
- **`{domain}.mutations.ts`** — `useMutation` hooks; import keys from `./keys` and
  invalidate/update cache in `onSuccess`

## Example: adding a new endpoint

```ts
// entities/book/api/book.mutations.ts
export function usePatchBookCover(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (cover: string) =>
      api<ApiBook>(`/books/${id}`, { method: 'PATCH', body: { cover } }),
    onSuccess: () => client.invalidateQueries({ queryKey: booksKey }),
  });
}
```

Then re-export it from `book.api.ts` if callers use the barrel path, or import
directly from `book.mutations.ts`.
