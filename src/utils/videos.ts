import type { FfprobeOutput } from "../types/ffmpeg";

export async function getVideoAspectRatio(filePath: string): Promise<'landscape' | 'portrait' | 'other'> {
  if (!filePath) throw new Error('File path is required');
  const proc = Bun.spawn([
    'ffprobe',
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'json',
    filePath
  ]);

  const stdoutText = await new Response(proc.stdout).text();
  const stderrText = await new Response(proc.stderr).text();

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`ffprobe failed (exit ${exitCode}): ${stderrText}`);
  };

  let output: FfprobeOutput;
  try {
    output = JSON.parse(stdoutText);
  } catch (e) {
    throw new Error(`Failed to parse ffprobe output: ${stdoutText}`);
  };

  if (!output.streams || output.streams.length === 0) {
    throw new Error('No video streams found');
  };
  
  const videoWidth = output.streams[0].width;
  const videoHeight = output.streams[0].height;

  if (!videoWidth || !videoHeight) {
    throw new Error('Could not determine video dimensions');
  }

  const aspectRatio = videoWidth / videoHeight;
  
  const landscapeRatio = 16 / 9;
  const portraitRatio = 9 / 16;
  const tolerance = 0.01;

  if (Math.abs(aspectRatio - landscapeRatio) < tolerance) {
    return 'landscape';
  }
  
  if (Math.abs(aspectRatio - portraitRatio) < tolerance) {
    return 'portrait';
  }
  
  return 'other';
};