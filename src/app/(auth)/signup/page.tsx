import { TabsContent } from "@/components/ui/tabs";
import SignUpForm from "@/components/signUp";

export default function SignupPage() {
  return (
    <TabsContent value="signup">
      <SignUpForm />
    </TabsContent>
  );
}
