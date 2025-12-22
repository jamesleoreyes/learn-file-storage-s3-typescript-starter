import { type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo } from "../db/videos";
import { randomBytes } from 'crypto';
import { respondWithJSON } from "./json";
import { getVideoAspectRatio, processVideoForFastStart } from "../utils/videos";

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) throw new BadRequestError('Invalid video ID');

  const token = getBearerToken(req.headers);
  const userId = validateJWT(token, cfg.jwtSecret);

  const videoMetadata = getVideo(cfg.db, videoId);
  if (!videoMetadata) throw new NotFoundError('Video not found');

  if (userId !== videoMetadata.userID) {
    throw new UserForbiddenError('Forbidden');
  };

  const formData = await req.formData();
  const video = formData.get('video');
  if (!(video instanceof File)) {
    throw new BadRequestError('Video file missing');
  };

  const MAX_UPLOAD_SIZE = 1 << 30; // 1GB
  if (video.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError('Video file size exceeds max allowed size');
  };

  if (video.type !== 'video/mp4') {
    throw new BadRequestError('Invalid video file type');
  };

  const tempFileName = `${randomBytes(32).toString('hex')}.mp4`;
  const filePath = `assets/${tempFileName}`
  
  await Bun.write(filePath, video);
  const processedFilePath = await processVideoForFastStart(filePath);
  const fileContents = Bun.file(processedFilePath);

  const aspectRatio = await getVideoAspectRatio(processedFilePath);
  const fileName = `${aspectRatio}/${tempFileName}`;

  const s3File = cfg.s3Client.file(fileName);
  await s3File.write(fileContents, {
    type: 'video/mp4'
  });

  videoMetadata.videoURL = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${fileName}`;
  updateVideo(cfg.db, videoMetadata);

  await fileContents.delete();

  return respondWithJSON(200, videoMetadata);
};
