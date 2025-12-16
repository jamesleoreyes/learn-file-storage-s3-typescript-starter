import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";

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

  const imageArrayBuffer = await image.arrayBuffer();
  const imageBuffer = await Buffer.from(imageArrayBuffer);
  const imageBase64 = imageBuffer.toString('base64');
  const imageDataUrl = `data:image/png;base64,${imageBase64}`;
  const videoMetadata = getVideo(cfg.db, videoId);
  if (!videoMetadata) {
    throw new NotFoundError('Cannot find video');
  }

  if (userID !== videoMetadata.userID) {
    throw new UserForbiddenError('Forbidden');
  };

  videoMetadata.thumbnailURL = imageDataUrl;

  updateVideo(cfg.db, videoMetadata);

  return respondWithJSON(200, videoMetadata);
};
