"use client";

import { useState } from "react";
import { Search, Gift, Sparkles, User, Tag, CalendarHeart } from "lucide-react";

type Product = {
  title: string;
  price: string;
  link: string;
  thumbnail: string;
  source: string;
  reasoning: string;
};

export default function Home() {
  const [friendName, setFriendName] = useState("");
  const [interests, setInterests] = useState("");
  const [budget, setBudget] = useState("");
  const [occasion, setOccasion] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Product[] | null>(null);
  const [error, setError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResults(null);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ friendName, interests, budget, occasion }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to find gifts");
      }

      setResults(data.products);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <nav className="nav">
        <div className="logo">
          <Gift className="logo-icon" size={28} />
          Gift Hunter AI
        </div>
        <a href="https://dev.to" target="_blank" rel="noreferrer" style={{color: 'var(--text-secondary)', textDecoration: 'none'}}>
          Hacktoberfest 2026
        </a>
      </nav>

      <div className="header">
        <h1>Find the Perfect Gift.</h1>
        <p>Tell us about your friend, and our Gemma-powered AI will scour the web to find the most thoughtful, unique gifts they'll actually love.</p>
      </div>

      <div className="grid-2">
        <div className="card">
          <form onSubmit={handleSearch}>
            <div className="input-group">
              <label><User size={14} style={{display: 'inline', marginRight: '4px', verticalAlign: 'middle'}}/> Friend's Name</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Alex"
                value={friendName}
                onChange={(e) => setFriendName(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <label><Sparkles size={14} style={{display: 'inline', marginRight: '4px', verticalAlign: 'middle'}}/> Interests & Hobbies</label>
              <textarea
                className="textarea"
                placeholder="e.g. Loves obscure 80s synth-pop, mechanical keyboards, and making pour-over coffee."
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                required
              />
            </div>

            <div className="grid-2" style={{gap: '1rem'}}>
              <div className="input-group">
                <label><Tag size={14} style={{display: 'inline', marginRight: '4px', verticalAlign: 'middle'}}/> Budget ($)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. 50"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  required
                />
              </div>

              <div className="input-group">
                <label><CalendarHeart size={14} style={{display: 'inline', marginRight: '4px', verticalAlign: 'middle'}}/> Occasion</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Birthday, Christmas, Just Because"
                  value={occasion}
                  onChange={(e) => setOccasion(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn" disabled={loading} style={{width: '100%', marginTop: '1rem'}}>
              {loading ? (
                <>
                  <span className="loading-spinner"></span> Searching the Web & Reasoning...
                </>
              ) : (
                <>
                  <Search size={18} /> Find Gifts
                </>
              )}
            </button>
            {error && <p style={{color: '#ef4444', marginTop: '1rem', textAlign: 'center'}}>{error}</p>}
          </form>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', minHeight: '400px' }}>
          {!results && !loading && (
            <>
              <div style={{background: 'rgba(99, 102, 241, 0.1)', padding: '2rem', borderRadius: '50%', marginBottom: '1.5rem'}}>
                <Gift size={48} style={{color: 'var(--accent-primary)'}} />
              </div>
              <h3 style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>Waiting for details</h3>
              <p style={{color: 'var(--text-secondary)', maxWidth: '300px'}}>Fill out the form to let Gemma find the best gifts across the web via SerpApi.</p>
            </>
          )}

          {loading && (
             <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem'}}>
               <div className="loading-spinner" style={{width: '40px', height: '40px', borderWidth: '3px'}}></div>
               <p style={{color: 'var(--accent-primary)', fontWeight: 500}}>Analyzing interests...</p>
             </div>
          )}

          {results && results.length > 0 && (
             <div style={{width: '100%', height: '100%', overflowY: 'auto'}}>
                <h3 style={{textAlign: 'left', marginBottom: '1rem', fontSize: '1.5rem'}}>Top Picks for {friendName}</h3>
                <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                  {results.map((product, i) => (
                    <div key={i} style={{background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem', textAlign: 'left', border: '1px solid var(--border-color)'}}>
                      <div style={{display: 'flex', gap: '1rem'}}>
                        {product.thumbnail && (
                           <img src={product.thumbnail} alt={product.title} style={{width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', background: 'white'}} />
                        )}
                        <div>
                          <h4 style={{fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem'}}>{product.title}</h4>
                          <div style={{color: 'var(--accent-secondary)', fontWeight: 700, marginBottom: '0.5rem'}}>{product.price}</div>
                          <a href={product.link} target="_blank" rel="noreferrer" style={{color: 'var(--accent-primary)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500}}>View on {product.source} →</a>
                        </div>
                      </div>
                      <div className="reasoning-box">
                        <span style={{color: 'var(--accent-primary)', fontWeight: 600, marginRight: '4px'}}>✨ Gemma's Reasoning:</span>
                        {product.reasoning}
                      </div>
                    </div>
                  ))}
                </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
