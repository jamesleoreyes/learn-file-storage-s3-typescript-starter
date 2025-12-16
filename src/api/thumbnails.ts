import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

const videoThumbnails: Map<string, Thumbnail> = new Map();

export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  };

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  };

  const thumbnail = videoThumbnails.get(videoId);
  if (!thumbnail) {
    throw new NotFoundError("Thumbnail not found");
  };

  return new Response(thumbnail.data, {
    headers: {
      "Content-Type": thumbnail.mediaType,
      "Cache-Control": "no-store",
    },
  });
};

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  };

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = await req.formData();
  const image = formData.get('thumbnail');
  if (!(image instanceof File)) {
    throw new BadRequestError('Thumbnail file missing');
  };

  const MAX_UPLOAD_SIZE = 10 << 20;

  if (image.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError('Thumbnail file size exceeds max allowed size');
  };

  const mediaType = image.type;
  if (!mediaType) throw new BadRequestError("Missing Content-Type for thumbnail");

  const imageData = await image.arrayBuffer();
  const videoMetadata = getVideo(cfg.db, videoId);
  if (!videoMetadata) {
    throw new NotFoundError('Cannot find video');
  }

  if (userID !== videoMetadata.userID) {
    throw new UserForbiddenError('Forbidden');
  };

  videoThumbnails.set(videoMetadata.id, { data: imageData, mediaType });

  const thumbnailUrl = `http://localhost:${cfg.port}/api/thumbnails/${videoId}`;
  videoMetadata.thumbnailURL = thumbnailUrl;

  updateVideo(cfg.db, videoMetadata);

  return respondWithJSON(200, videoMetadata);
};
