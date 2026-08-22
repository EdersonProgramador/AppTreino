-- Deduplicate before unique indexes
DELETE FROM likes a USING likes b
WHERE a.id > b.id AND a.user_id = b.user_id AND a.post_id = b.post_id;

DELETE FROM dislikes a USING dislikes b
WHERE a.id > b.id AND a.user_id = b.user_id AND a.post_id = b.post_id;

DELETE FROM "Follower" a USING "Follower" b
WHERE a.id > b.id AND a.fk_user_id = b.fk_user_id AND a.fk_follower_id = b.fk_follower_id;

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Follower_fk_user_id_fk_follower_id_key" ON "Follower"("fk_user_id", "fk_follower_id");
CREATE UNIQUE INDEX IF NOT EXISTS "likes_user_id_post_id_key" ON "likes"("user_id", "post_id");
CREATE UNIQUE INDEX IF NOT EXISTS "dislikes_user_id_post_id_key" ON "dislikes"("user_id", "post_id");
