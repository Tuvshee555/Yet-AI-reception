import DemoChat from "@/components/DemoChat";
import Head from "next/head";

export default function Home() {
  return (
    <div className="min-h-screen p-6">
      <Head>
        <title>YETI Academy AI Reception</title>
      </Head>
      <main className="max-w-3xl mx-auto">
        <h1 className="text-2xl mb-4">YETI Academy AI Reception</h1>
        <DemoChat />
      </main>
    </div>
  );
}
