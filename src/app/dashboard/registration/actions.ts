"use server";

import { ActionResult, fail } from "@/utils/action-result";
import z from "zod";
import { formSchema } from "./schema";

export async function Register(
  data: z.infer<typeof formSchema>,
): Promise<ActionResult> {
  console.log(data);
  const { data: safeData, success } = formSchema.safeParse(data);

  if (success) {
    console.log(safeData);
  }
  return fail("idk");
}
