import { Card, CardContent } from "@/components/ui/card";
export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <h1 className="mb-5 font-cond text-[28px] font-bold leading-tight max-md:hidden">{title}</h1>
      <Card><CardContent className="py-10 text-center text-muted-foreground">{title} is in the v3 blueprint. It gets rebuilt in React in a later step.</CardContent></Card>
    </>
  );
}

export function NotAllowed({ title }: { title: string }) {
  return (
    <>
      <h1 className="mb-5 font-cond text-[28px] font-bold leading-tight max-md:hidden">{title}</h1>
      <Card><CardContent className="py-10 text-center text-muted-foreground">{title} is for the owner only. Ask the owner if you need something from this page.</CardContent></Card>
    </>
  );
}
