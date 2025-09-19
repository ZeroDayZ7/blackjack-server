import { z } from 'zod';

const BaseGameSchema = z.object({
  nick: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[a-zA-Z0-9_-]+$/),
  lobbyId: z.uuid(),
});

export const StartGameSchema = BaseGameSchema.extend({
  type: z.literal('start_game'),
});

export const SubscribeGameSchema = BaseGameSchema.extend({
  type: z.literal('subscribe_to_game'),
});

export const PlayerReadySchema = BaseGameSchema.extend({
  type: z.literal('player_ready'),
});

export const RestartGameSchema = BaseGameSchema.extend({
  type: z.literal('restart_game'),
});

export const PlayerActionSchema = BaseGameSchema.extend({
  type: z.literal('player_action'),
  action: z.enum(['hit', 'stand', 'double']),
});

export const LeaveGameSchema = BaseGameSchema.extend({
  type: z.literal('leave_game'),
});

export type StartGameInput = z.infer<typeof StartGameSchema>;
export type SubscribeGameInput = z.infer<typeof SubscribeGameSchema>;
export type PlayerReadyInput = z.infer<typeof PlayerReadySchema>;
export type RestartGameInput = z.infer<typeof RestartGameSchema>;
export type PlayerActionInput = z.infer<typeof PlayerActionSchema>;
export type LeaveGameInput = z.infer<typeof LeaveGameSchema>;

export type GameInput =
  | StartGameInput
  | SubscribeGameInput
  | PlayerReadyInput
  | RestartGameInput
  | PlayerActionInput
  | LeaveGameInput;

export const GameSchemas = {
  start_game: StartGameSchema,
  subscribe_to_game: SubscribeGameSchema,
  player_ready: PlayerReadySchema,
  restart_game: RestartGameSchema,
  player_action: PlayerActionSchema,
  leave_game: LeaveGameSchema,
} as const;

export type GameSchemaKey = keyof typeof GameSchemas;
