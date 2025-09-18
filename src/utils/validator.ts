import { z } from "zod";

export const ActionSchema = z.object({
  lobbyId: z.uuid({ message: "Invalid lobbyId" }).optional(),
  lobbyName: z.string().min(1).max(50).optional(),
  nick: z.string().min(1, "Missing nick"),
});

export type ActionInput = z.infer<typeof ActionSchema>;
