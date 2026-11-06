import { redirect } from "next/navigation";

/** The citizen map is now the Community home (/community); keep old links working. */
export default function CommunityMapRedirect() {
  redirect("/community");
}
