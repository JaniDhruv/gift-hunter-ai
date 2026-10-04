"use client";

import { FormEvent, useState } from "react";
import "./shop.css";
import { ArrowDown, ArrowUp, ArrowUpRight, Gift, Heart, Loader2, Search, Sparkles, UserRound } from "lucide-react";

type Direction = { id: string; title: string; category: string; estimatedPrice: string; whyItFits: string; personalTouch: string };
type Plan = { recipientSummary: string; giftStrategy: string; directions: Direction[] };
type Product = { title: string; price: string; link: string; linkLabel: string; source: string; thumbnail?: string; directionId: string; directionTitle: string };
type Result = { plan: Plan; products: Product[]; mode: string; provider?: string; model?: string; searchCount: number; budget: number; shoppingEnabled: boolean; fallbackReason?: string };

export default function Home() {
  const [friendName, setFriendName] = useState("");
  const [interests, setInterests] = useState("");
  const [budget, setBudget] = useState("");
  const [occasion, setOccasion] = useState("Birthday");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [view, setView] = useState<"plan" | "shop">("plan");
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ friendName, interests, budget, occasion }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to build a gift plan.");
      setResult(data);
      setView(data.products?.length ? "shop" : "plan");
      setShowAllProducts(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to build a gift plan.");
    } finally {
      setLoading(false);
    }
  }

  const hasProducts = Boolean(result?.products.length);
  const productGroups = Object.values((result?.products || []).reduce<Record<string, { directionId: string; directionTitle: string; products: Product[] }>>((groups, product) => {
    const group = groups[product.directionId] || (groups[product.directionId] = { directionId: product.directionId, directionTitle: product.directionTitle, products: [] });
    group.products.push(product);
    return groups;
  }, {}));
  const hasMoreProducts = productGroups.some((group) => group.products.length > 2);

  return <main className="app-shell">
    <nav className="nav"><a className="brand" href="#top"><Gift size={21} /><span>Gift Hunter Agent</span></a><span className="nav-note">Thoughtful gifts, found with AI</span></nav>
    <section className="hero" id="top"><p className="eyebrow"><Heart size={14} /> Personal gift planner</p><h1>Find a gift that feels <em>made for them.</em></h1><p>Start with what you know. Get eight ideas shaped around their interests, budget, and occasion, with live listings for the strongest picks.</p></section>
    <section className="workspace">
      <form className="brief" onSubmit={handleSearch}>
        <div className="section-heading"><span>01</span><div><h2>Read the room</h2><p>Specific details make the plan better.</p></div></div>
        <label><UserRound size={15} /> Their name<input value={friendName} onChange={(event) => setFriendName(event.target.value)} placeholder="Alex" required /></label>
        <label><Sparkles size={15} /> Interests & personal clues<textarea value={interests} onChange={(event) => setInterests(event.target.value)} placeholder="Coding, anime, favorite series, what they already own..." required /></label>
        <div className="form-row"><label>Budget<input inputMode="numeric" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="100" required /></label><label>Occasion<input value={occasion} onChange={(event) => setOccasion(event.target.value)} placeholder="Birthday" required /></label></div>
        <button className="find-button" type="submit" disabled={loading}>{loading ? <><Loader2 className="spin" size={18} /> Building your plan</> : <><Search size={18} /> Build gift plan</>}</button>
        {error && <p className="error" role="alert">{error}</p>}<p className="quota-note">One AI plan. Shopping checks the top three ideas only.</p>
      </form>
      <section className="recommendations" aria-live="polite">
        {loading && <div className="empty-state"><Loader2 className="spin accent-icon" size={30} /><h2>Connecting the dots</h2><p>Creating eight ways to make this feel personal.</p></div>}
        {!loading && !result && <div className="empty-state"><div className="gift-mark"><Gift size={30} /></div><div><p className="eyebrow">Your gift shortlist</p><h2>Start with what makes them, them.</h2><p>Thoughtful ideas and real listings will land here.</p></div></div>}
        {!loading && result && <>
          <header className="results-heading"><div><p className="eyebrow">{result.mode}{result.provider ? ` · ${result.provider}` : ""}</p><h2>For {friendName}</h2></div><span>{result.plan.directions.length} directions</span></header>
          <div className="strategy"><p>{result.plan.recipientSummary}</p><strong>{result.plan.giftStrategy}</strong>{result.mode === "Curated backup plan" && <p className="backup-note"><b>AI connection issue:</b> {result.fallbackReason || "The model did not return a usable plan."} Curated gift directions are shown below.</p>}{result.mode !== "Curated backup plan" && result.products.length === 0 && <p className="backup-note">{result.shoppingEnabled ? `No live listings with a verifiable price under $${result.budget} were found. Your gift directions are still here.` : "Live shopping is not configured, so only the gift directions are available."}</p>}</div>
          <div className="tabs" role="tablist"><button className={view === "plan" ? "active" : ""} onClick={() => setView("plan")} type="button">Gift directions <span>8</span></button>{hasProducts && <button className={view === "shop" ? "active" : ""} onClick={() => setView("shop")} type="button">Verified picks <span>{result.products.length}</span></button>}</div>
          {view === "plan" && <div className="direction-grid">{result.plan.directions.map((direction, index) => <article className="direction-card" key={direction.id}><div className="direction-top"><span>0{index + 1}</span><small>{direction.category}</small></div><h3>{direction.title}</h3><p className="price">{direction.estimatedPrice}</p><p>{direction.whyItFits}</p><div className="personal-touch"><Sparkles size={14} /><span>{direction.personalTouch}</span></div></article>)}</div>}
          {view === "shop" && hasProducts && <>
            <div className="shop-summary"><p>{result.products.length} listings across {productGroups.length} gift ideas</p>{hasMoreProducts && <button type="button" onClick={() => setShowAllProducts((shown) => !shown)}>{showAllProducts ? "Show fewer" : `Show all ${result.products.length}`} {showAllProducts ? <ArrowUp size={14} /> : <ArrowDown size={14} />}</button>}</div>
            <div className="shop-list">{productGroups.map((group, groupIndex) => {
              const category = result.plan.directions.find((direction) => direction.id === group.directionId)?.category;
              const products = showAllProducts ? group.products : group.products.slice(0, 2);
              return <section className="product-group" key={group.directionId}>
                <header className="product-group-heading"><div><p className="eyebrow">Direction 0{groupIndex + 1}{category ? ` · ${category}` : ""}</p><h3>{group.directionTitle}</h3></div><span>{group.products.length} picks</span></header>
                <div className="product-grid">{products.map((product, index) => <article className="product-result" key={`${product.title}-${index}`}>{product.thumbnail ? <img src={product.thumbnail} alt="" /> : <div className="product-placeholder"><Gift size={24} /></div>}<div className="product-copy"><div className="product-meta"><span>{product.source}</span></div><h4><a className="product-title-link" href={product.link} target="_blank" rel="noopener noreferrer">{product.title}</a></h4><div className="product-bottom"><p className="price">{product.price}</p><a className="product-link" href={product.link} target="_blank" rel="noopener noreferrer">{product.linkLabel} <ArrowUpRight size={15} /></a></div></div></article>)}</div>
              </section>;
            })}</div>
          </>}
        </>}
      </section>
    </section>
  </main>;
}
