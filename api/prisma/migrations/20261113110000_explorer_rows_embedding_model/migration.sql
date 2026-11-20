-- specs/020 B3.4: which model made each row's vector. Nullable, no default: metadata-only.
ALTER TABLE "explorer_rows" ADD COLUMN "embedding_model" TEXT;

-- Every vector so far came from text-embedding-3-small (dev's only labelling runs, specs/018).
UPDATE "explorer_rows" SET "embedding_model" = 'text-embedding-3-small'
WHERE cardinality("embedding") > 0;
