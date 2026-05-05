import { NewCouncilForm } from "@/components/council/new-council-form";

export default function NewCouncilPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">New council run</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">
          Brief the agents
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          The council will generate twelve source-code product ideas, reject weak
          ones, debate the top five, score Day-One Sale Probability, and only
          choose Build now when an idea clears 85.
        </p>
      </div>

      <NewCouncilForm />
    </div>
  );
}
