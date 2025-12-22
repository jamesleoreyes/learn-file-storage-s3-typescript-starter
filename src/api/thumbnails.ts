import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import path from "path";
import { randomBytes } from "crypto";

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) throw new BadRequestError("Invalid video ID");

  const token = getBearerToken(req.headers);
  const userId = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userId);

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

  if (!['image/jpeg', 'image/png'].includes(mediaType)) {
    throw new BadRequestError('Invalid file type');
  };

  const fileExt = mediaType.split('/')[1];
  const base64String = randomBytes(32).toString('base64url');
  const imagePath = `${base64String}.${fileExt}`;
  const imageArrayBuffer = await image.arrayBuffer();
  const imageBuffer = Buffer.from(imageArrayBuffer);
  const imageFilePath = path.join(cfg.assetsRoot, imagePath);
  Bun.write(imageFilePath, imageBuffer);
  const videoMetadata = getVideo(cfg.db, videoId);
  if (!videoMetadata) throw new NotFoundError('Video not found');

  if (userId !== videoMetadata.userID) {
    throw new UserForbiddenError('Forbidden');
  };

  videoMetadata.thumbnailURL = `http://localhost:${cfg.port}/assets/${imagePath}`;

  updateVideo(cfg.db, videoMetadata);

  return respondWithJSON(200, videoMetadata);
};
