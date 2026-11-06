import { z } from 'zod';
export const codecSchema = z.enum(['h264', 'h265', 'vp9']);
export const containerSchema = z.enum(['mp4', 'mkv', 'webm']);
export const resolutionSchema = z.union([z.literal(0), z.literal(2160), z.literal(1440), z.literal(1080), z.literal(720), z.literal(480)]);
export const fpsSchema = z.union([z.literal(0), z.literal(60), z.literal(30), z.literal(24)]);
export const settingsSchema = z.object({ codec: codecSchema, container: containerSchema, crf: z.number().int().min(0).max(63), resolution: resolutionSchema, fps: fpsSchema, preset: z.string() });
export type Codec = z.infer<typeof codecSchema>;
export type Resolution = z.infer<typeof resolutionSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export const videoSchema = z.object({
  id: z.string(), path: z.string(), name: z.string(), width: z.number().positive(), height: z.number().positive(),
  duration: z.number().nonnegative(), fps: z.number().positive().nullable(), fpsRational: z.string().nullable(), hasAudio: z.boolean(),
});
export type Video = z.infer<typeof videoSchema>;
export const probeResultsSchema = z.array(z.discriminatedUnion('status', [
  z.object({ status: z.literal('ready'), video: videoSchema }),
  z.object({ status: z.literal('error'), path: z.string(), error: z.string() }),
]));
export type ProbeResult = z.infer<typeof probeResultsSchema>[number];
export const environmentSchema = z.object({ ffmpeg: z.boolean(), ffprobe: z.boolean(), encoders: z.array(z.string()), errors: z.array(z.string()) });
export type Environment = z.infer<typeof environmentSchema>;
export const progressSchema = z.object({
  batchId: z.string(), fileId: z.string(), status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'finished']),
  progress: z.number().min(0).max(100), outputPath: z.string().nullable(), error: z.string().nullable(),
});
export type FileProgress = z.infer<typeof progressSchema>;
