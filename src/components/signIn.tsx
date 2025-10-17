"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { authClient } from "@/utils/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

// only validate email format
const formSchema = z.object({
  email: z.email("Please enter a valid email address."),
  password: z.string(),
});

export default function SignInForm() {
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  function onSubmit(credentials: z.infer<typeof formSchema>) {
    authClient.signIn.email(credentials, {
      onRequest: () => setLoading(true),
      onSuccess: () => {
        setLoading(false);
        toast.success("Signed in successfully", {
          description: "Redirecting to your dashboard...",
        });
        router.push("/dashboard");
      },
      onError: (ctx) => {
        setLoading(false);
        toast.error("Sign-in failed", {
          description:
            ctx?.error?.message ?? "Invalid credentials or network issue.",
        });
      },
    });
  }

  return (
    <Card className="w-full sm:max-w-md">
      <CardHeader>
        <CardTitle>Sign In</CardTitle>
        <CardDescription>
          Welcome back! Enter your credentials to continue.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form id="form-signin" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            {/* Email */}
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-signin-email">Email</FieldLabel>
                  <Input
                    {...field}
                    id="form-signin-email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    aria-invalid={fieldState.invalid}
                    disabled={loading}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* Password (no validation) */}
            <Controller
              name="password"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="form-signin-password">
                    Password
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-signin-password"
                    type="password"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={loading}
                  />
                </Field>
              )}
            />
          </FieldGroup>
        </form>
      </CardContent>

      <CardFooter className="flex-col items-start">
        <Field orientation="horizontal">
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset()}
            disabled={loading}
          >
            Reset
          </Button>
          <Button type="submit" form="form-signin" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing In...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </Field>

        <div className="text-sm mt-4">
          <span>Don’t have an account?</span>
          <Link className="ml-1 font-medium hover:underline" href="/signup">
            Signup
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
