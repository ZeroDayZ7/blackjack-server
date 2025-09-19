import { z } from 'zod';

const BaseLobbySchema = z.object({
  nick: z.string().min(2).max(20).regex(/^[a-zA-Z0-9_-]+$/),
  lobbyId: z.uuid().optional(),
});

export const CreateLobbySchema = z.object({
  type: z.literal('create_lobby'),
  nick: z.string().min(2).max(20).regex(/^[a-zA-Z0-9_-]+$/),
  lobbyName: z.string().min(1).max(20),
  maxPlayers: z.number().int().min(1).max(4),
  useBots: z.boolean(),
});

export const JoinLobbySchema = BaseLobbySchema.extend({
  type: z.literal('join_lobby'),
});

export const LeaveLobbySchema = BaseLobbySchema.extend({
  type: z.literal('leave_lobby'),
});

export const PingLobbySchema = z.object({
  type: z.literal('ping_lobbies'),
});

export type CreateLobbyInput = z.infer<typeof CreateLobbySchema>;
export type JoinLobbyInput = z.infer<typeof JoinLobbySchema>;
export type LeaveLobbyInput = z.infer<typeof LeaveLobbySchema>;
export type PingLobbiesInput = z.infer<typeof PingLobbySchema>;

export type LobbyInput = CreateLobbyInput | JoinLobbyInput | LeaveLobbyInput | PingLobbiesInput;

export const LobbySchemas = {
  create_lobby: CreateLobbySchema,
  join_lobby: JoinLobbySchema,
  leave_lobby: LeaveLobbySchema,
  ping_lobbies: PingLobbySchema,
} as const;

export type LobbySchemaKey = keyof typeof LobbySchemas;
