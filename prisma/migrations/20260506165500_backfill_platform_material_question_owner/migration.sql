UPDATE "Question" AS q
SET "ownerId" = NULL
FROM "MaterialQuestionCandidate" AS c
JOIN "Material" AS m ON m."id" = c."materialId"
WHERE c."confirmedQuestionId" = q."id"
  AND m."libraryScope" = 'platform'
  AND q."ownerId" = m."ownerId";
