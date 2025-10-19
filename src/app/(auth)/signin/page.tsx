import { TabsContent } from "@/components/ui/tabs";
import SignInForm from "@/components/signIn";

export default function LoginPage() {
  return (
    <TabsContent value="signin">
      <SignInForm />
    </TabsContent>
  );
}
