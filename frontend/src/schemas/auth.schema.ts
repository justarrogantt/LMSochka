import { z } from "zod"

export const UserSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable()
}).strip()

export const AuthSuccessSchema = z.object({
  user: UserSchema,
  access_token: z.string(),
  refresh_token: z.string()
}).strip()

export type AuthUser = z.infer<typeof UserSchema>
export type AuthSuccess = z.infer<typeof AuthSuccessSchema>
