-- CreateEnum
CREATE TYPE "MusicPublishStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "music_albums" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cover_url" TEXT,
    "status" "MusicPublishStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_tracks" (
    "id" TEXT NOT NULL,
    "album_id" TEXT,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "audio_url" TEXT NOT NULL,
    "cover_url" TEXT,
    "duration_sec" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "MusicPublishStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "music_albums_status_published_at_idx" ON "music_albums"("status", "published_at");

-- CreateIndex
CREATE INDEX "music_tracks_album_id_sort_order_idx" ON "music_tracks"("album_id", "sort_order");

-- CreateIndex
CREATE INDEX "music_tracks_status_published_at_idx" ON "music_tracks"("status", "published_at");

-- AddForeignKey
ALTER TABLE "music_tracks" ADD CONSTRAINT "music_tracks_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "music_albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;
