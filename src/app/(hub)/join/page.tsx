import { Suspense } from "react";
import { JoinFlow } from "./JoinFlow";
export const metadata = { title: "Join auction" };
export default function Page() {
  return (
    <Suspense>
      <JoinFlow />
    </Suspense>
  );
}
