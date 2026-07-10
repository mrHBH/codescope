// Auto-extracted document content. Edit pages independently.
export const PAGES: string[] = [
`<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Showcase</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">GPU text rendering</div>
    <h1>Pixel-perfect type, <em>rendered analytically</em>.</h1>
    <p class="lead editable">A full CSS rule engine &mdash; selector matching, :hover/:active pseudo-classes, and transition interpolation &mdash; drawn through windfoil's closed-form GPU pipeline. Text stays razor sharp at any zoom. Click me and start typing.</p>
    <div class="btn-row">
      <div class="btn jump" data-page="1">Explore features</div>
      <div class="btn ghost jump" data-page="2">View showcase</div>
    </div>
    <div class="btn-row">
      <div class="btn small ghost jump" data-page="7">Blog</div>
      <div class="btn small ghost jump" data-page="8">Pricing</div>
      <div class="btn small ghost jump" data-page="9">FAQ</div>
      <div class="btn small ghost jump" data-page="10">Playground</div>
    </div>
    <div class="progress"></div>
    <div class="pulse">Live &mdash; 60 fps</div>
  </div>
    <div class="alert"><div>Everything you see &mdash; every box, every glyph &mdash; is one GPU draw call, shaded analytically.</div></div>
    <div style="display:flex;align-items:center;gap:16px;margin:20px 0;">
      <div class="glow"></div>
      <div class="float"></div>
      <div class="spin"></div>
      <div class="bounce"></div>
      <div class="heartbeat"></div>
    </div>
  <h2>Hover effects</h2>
  <div class="card"><h3 class="editable">Hover Card</h3><p>Move your mouse over this card. The box-shadow interpolates smoothly. Hover state is detected by hit-testing the cursor's world position against element bounds.</p><span class="tag">hover</span><span class="tag">transition</span></div>
  <h2>Features</h2>
  <div class="grid">
    <div class="feature"><h3>Sharp text</h3><p>Glyphs stay razor sharp at any zoom. The shader integrates a closed-form winding number per pixel.</p></div>
    <div class="feature"><h3>One draw call</h3><p>Every background, glyph, and hover state is a single GPU instance batch.</p></div>
  </div>
  <div class="callout"><div><h3>Built for the GPU</h3><p>Per-pixel analytic anti-aliasing with zero aliasing artifacts at any scale.</p></div></div>
  <h2>Code block</h2>
  <pre>export function coverage(pixel: vec2f, atlas: CurveAtlas) -> f32 {
  var w: f32 = 0.0;
  for each row-band containing pixel.y:
    for each curve piece in band:
      w += winding_contribution(curve, pixel);
  return min(abs(w), 1.0);
}</pre>
  <p>Code blocks render syntax-colored on a dark background.</p>
  <div class="marquee">windfoil | analytic coverage | zero aliasing | full CSS state machine | one draw call | razor-sharp at any zoom | </div>
  <h2>What you get</h2>
  <ul><li>Full CSS selector matching</li><li>:hover and :active pseudo-classes</li><li>CSS transition interpolation</li><li>Per-pixel analytic AA</li></ul>
  <div class="card"><h3>Interactive button</h3><p>Click or hover this button. The background color transitions smoothly. The :active state triggers a color change.</p><div class="btn">Click me</div></div>
  <p class="footer">Windfoil CSS Engine &middot; Per-pixel analytic AA &middot; Full CSS state machine</p>
</div>`
,
`<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Showcase</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">Capabilities</div>
    <h1>Everything a CSS engine should do.</h1>
  </div>
  <div class="stats">
    <div class="stat"><div class="num">0</div><div class="lbl">aliasing artifacts</div></div>
    <div class="stat"><div class="num">1</div><div class="lbl">draw call</div></div>
    <div class="stat"><div class="num">&#8734;</div><div class="lbl">zoom levels</div></div>
  </div>
  <h2>How it works</h2>
  <div class="steps">
    <div class="step"><div class="n">1</div><div><h3>Parse</h3><p>The stylesheet is parsed into rules; selectors are matched against the element tree.</p></div></div>
    <div class="step"><div class="n">2</div><div><h3>Layout</h3><p>The browser computes every box; we read its rect so hits line up with pixels.</p></div></div>
    <div class="step"><div class="n">3</div><div><h3>Paint</h3><p>Each background and glyph is one GPU instance, shaded analytically.</p></div></div>
  </div>
  <h2>Timeline</h2>
  <div class="timeline">
    <div class="tl"><h3>Parse</h3><p>CSS becomes a rule list in microseconds.</p></div>
    <div class="tl"><h3>Match</h3><p>Selectors resolve against the live DOM tree.</p></div>
    <div class="tl"><h3>Shade</h3><p>Windfoil integrates coverage per pixel, analytically.</p></div>
  </div>
  <div class="callout"><div><h3>Try it</h3><p>Scroll-zoom all the way out to see the entire document at once.</p></div></div>
  <div class="marquee">selectors | pseudo-classes | transitions | analytic coverage | closed-form integral | GPU instances | </div>
  <div class="card"><h3>Next</h3><p>See the engine in a real layout on the showcase page.</p><div class="btn jump" data-page="2">Go to showcase</div></div>
  <p class="footer">Windfoil &middot; Features page</p>
</div>`
,
`<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Showcase</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">Showcase</div>
    <h1>Designed to be read.</h1>
  </div>
  <div class="pullquote">"Typography is what language looks like." &mdash; and windfoil makes it look sharp everywhere.</div>
  <div class="status ok">All systems operational</div>
  <div class="badges">
    <div class="badge">Headings</div><div class="badge">Lead text</div><div class="badge">Cards</div><div class="badge">Badges</div><div class="badge">Stats</div><div class="badge">Quotes</div><div class="badge">Code</div><div class="badge">Buttons</div>
  </div>
  <div class="avatars"><div class="avatar">A</div><div class="avatar">B</div><div class="avatar">C</div><div class="avatar">D</div></div>
  <h2>Components</h2>
  <div class="grid">
    <div class="feature"><h3>Stat blocks</h3><p>Big numbers with small labels &mdash; great for dashboards.</p></div>
    <div class="feature"><h3>Step lists</h3><p>Numbered steps with circular markers guide the reader.</p></div>
    <div class="feature"><h3>Pull quotes</h3><p>Italic callouts break up long-form text.</p></div>
  </div>
  <div class="cta"><h3>Ready to render?</h3><p>Bring your own stylesheet &mdash; windfoil will parse it.</p><div class="btn jump" data-page="0">Back to home</div></div>
  <p class="footer">Windfoil &middot; Showcase page</p>
</div>`
,
`<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Showcase</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">Design tokens</div>
    <h1>Tabs, buttons, lists, tables.</h1>
  </div>
  <div class="tabs">
    <div class="tab active">Overview</div>
    <div class="tab">Details</div>
    <div class="tab">Settings</div>
  </div>
  <div class="tab-content"><p>This tab panel shows content for the active tab. In a real app clicking a tab would switch panels.</p></div>
  <h2>Button sizes</h2>
  <div class="btn-row">
    <div class="btn large">Large</div>
    <div class="btn">Default</div>
    <div class="btn small">Small</div>
    <div class="btn pill">Pill</div>
    <div class="btn ghost">Ghost</div>
    <div class="btn icon"><span>></span> Play</div>
  </div>
  <h2>Labels</h2>
  <div><span class="label accent">New</span><span class="label green">Success</span><span class="label muted">Draft</span></div>
  <h2>Table</h2>
  <div class="table">
    <div class="row head"><div class="cell">Name</div><div class="cell">Role</div><div class="cell">Status</div></div>
    <div class="row body"><div class="cell">Coverage shader</div><div class="cell">Fragment</div><div class="cell"><span class="label green">Active</span></div></div>
    <div class="row body"><div class="cell">Glyph bander</div><div class="cell">CPU pre-pass</div><div class="cell"><span class="label accent">Beta</span></div></div>
    <div class="row body"><div class="cell">CSS engine</div><div class="cell">Runtime</div><div class="cell"><span class="label green">Active</span></div></div>
  </div>
  <h2>Description list</h2>
  <dl class="list-desc"><dt>Analytic coverage</dt><dd>Closed-form winding number per pixel; zero aliasing at any zoom.</dd><dt>GPU instance batch</dt><dd>Every rect and glyph in one draw call; sorted for closest-hit early-out.</dd></dl>
  <h2>Split layout</h2>
  <div class="split"><div class="card"><h3>Left panel</h3><p>Flex-based side-by-side with equal-width boxes.</p></div><div class="card"><h3>Right panel</h3><p>Both children share space equally; great for comparisons.</p></div></div>
  <div class="btn-row"><div class="btn jump" data-page="4">Next: Animations</div></div>
  <p class="footer">Windfoil &middot; Design System page</p>
</div>`
,
`<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Showcase</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">Motion</div>
    <h1>Time-driven animations.</h1>
  </div>
  <h2>Bounce &amp; heartbeat</h2>
  <div style="display:flex;align-items:center;gap:24px;margin:20px 0;">
    <div class="bounce"></div>
    <div class="heartbeat"></div>
    <div class="bounce"></div>
    <div class="heartbeat"></div>
  </div>
  <h2>Glow &amp; float</h2>
  <div style="display:flex;align-items:center;gap:24px;margin:20px 0;">
    <div class="glow"></div>
    <div class="float"></div>
    <div class="glow"></div>
    <div class="float"></div>
  </div>
  <h2>Spin &amp; shimmer</h2>
  <div style="display:flex;align-items:center;gap:24px;margin:20px 0;">
    <div class="spin"></div>
    <div class="shimmer"><span class="text-sm">Loading content...</span></div>
    <div class="spin"></div>
  </div>
  <h2>Check list</h2>
  <ul class="check-list"><li>v Full CSS selector matching</li><li>v :hover and :active pseudo-classes</li><li>v CSS transition interpolation</li><li>v Per-pixel analytic AA</li><li>v One GPU draw call</li></ul>
  <h2>Progress &amp; pulse</h2>
  <div class="progress"></div>
  <div class="pulse">Live &mdash; 60 fps</div>
  <div class="marquee">bounce | heartbeat | progress | pulse | marquee | tabs | table | badges | avatars | icons | </div>
  <h2>Animation cards</h2>
  <div class="grid">
    <div class="feature"><h3>Progress</h3><p>Bar fills automatically using a fraction of the frame timestamp.</p></div>
    <div class="feature"><h3>Bounce</h3><p>Rectangle oscillates vertically on a sine wave.</p></div>
    <div class="feature"><h3>Heartbeat</h3><p>Square pulses around its center point.</p></div>
  </div>
  <div class="grid">
    <div class="feature"><h3>Glow</h3><p>Pulsing luminous halo around a circle, breathing in and out.</p></div>
    <div class="feature"><h3>Float</h3><p>Gentle vertical drift on a slow sine wave, like a balloon.</p></div>
    <div class="feature"><h3>Spin</h3><p>Scale pulsing that simulates rotation foreshortening.</p></div>
  </div>
  <div class="grid">
    <div class="feature"><h3>Shimmer</h3><p>A highlight bar sweeps across the surface repeatedly.</p></div>
    <div class="feature"><h3>Pulse</h3><p>Dot indicator pulses with opacity oscillation.</p></div>
    <div class="feature"><h3>Marquee</h3><p>Text scrolls horizontally at constant speed.</p></div>
  </div>
  <div class="btn-row"><div class="btn jump" data-page="0">Back to home</div></div>
  <p class="footer">Windfoil &middot; Animations page</p>
</div>`
,
`<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Design</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">Typography</div>
    <h1>Every scale, every weight.</h1>
  </div>
  <div class="section-title">Hero heading</div>
  <div class="text-2xl editable">The quick brown fox jumps over the lazy dog.</div>
  <div class="section-title">XL heading</div>
  <div class="text-xl">Analytic coverage integrates over pixel footprints.</div>
  <div class="section-title">Large text</div>
  <div class="text-lg">Full CSS rule parsing, selector matching, pseudo-class state machine.</div>
  <div class="section-title">Body text</div>
  <p>A <code>const</code> binding inside the fragment shader captures the winding number. Use <span class="text-accent">coloured accents</span> and <span class="text-muted">muted text</span> to build <code>inline code</code> with emphasis.</p>
  <div class="section-title">Blockquote</div>
  <blockquote>"The shader integrates a closed-form winding number per pixel for perfect edges at any font size." &mdash; Windfoil docs</blockquote>
  <div class="section-title">Keyboard shortcuts</div>
  <p>Press <span class="kbd">Ctrl</span> <span class="kbd">N</span> for a new document, or <span class="kbd">Opt</span> <span class="kbd">Cmd</span> <span class="kbd">K</span> to open the palette.</p>
  <div class="section-title">Chips / tags</div>
  <div><span class="chip">CSS engine</span><span class="chip accent">GPU backend</span><span class="chip">Closed form</span><span class="chip accent">Analytic AA</span><span class="chip">Type rendering</span></div>
  <div class="section-title">Uppercase</div>
  <div class="uppercase" style="font-size:14px;color:#8866aa;">System operational &middot; zero errors detected</div>
  <div class="well">
    <div class="section-title">Well / inset card</div>
    <p>Use wells to group secondary content or show contextual panels.</p>
    <div class="btn-row"><div class="btn small">Action</div><div class="btn small ghost">Cancel</div></div>
  </div>
  <div class="btn-row"><div class="btn jump" data-page="6">Next: Components</div></div>
  <p class="footer">Windfoil &middot; Typography page</p>
</div>`
,
`<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Design</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">Components</div>
    <h1>Icons, chips, keys, wells.</h1>
  </div>
  <div class="section-title">Icon gallery</div>
  <div class="icon-grid">
    <div class="icon-item"><div class="glyph">></div><div class="name">play</div></div>
    <div class="icon-item"><div class="glyph">*</div><div class="name">star</div></div>
    <div class="icon-item"><div class="glyph">v</div><div class="name">check</div></div>
    <div class="icon-item"><div class="glyph">x</div><div class="name">cross</div></div>
    <div class="icon-item"><div class="glyph">&lt;3</div><div class="name">heart</div></div>
    <div class="icon-item"><div class="glyph">^</div><div class="name">up</div></div>
    <div class="icon-item"><div class="glyph">v</div><div class="name">down</div></div>
    <div class="icon-item"><div class="glyph">&lt;</div><div class="name">left</div></div>
    <div class="icon-item"><div class="glyph">#</div><div class="name">block</div></div>
    <div class="icon-item"><div class="glyph">*</div><div class="name">diamond</div></div>
    <div class="icon-item"><div class="glyph">*</div><div class="name">lozenge</div></div>
    <div class="icon-item"><div class="glyph">*</div><div class="name">snow</div></div>
  </div>
  <div class="section-title">More chips</div>
  <div>
    <span class="chip accent">&gt; Play</span>
    <span class="chip accent">* Star</span>
    <span class="chip"># Edit</span>
    <span class="chip">v Done</span>
    <span class="chip accent">x Close</span>
  </div>
  <div class="section-title">Button variants</div>
  <div class="btn-row">
    <div class="btn pill">Pill</div>
    <div class="btn pill ghost">Ghost Pill</div>
  </div>
  <div class="btn-row">
    <div class="btn large">Large CTA</div>
    <div class="btn icon"><span>--></span> Next</div>
  </div>
  <h2>Status cards</h2>
  <div class="grid">
    <div class="card"><h3>v Done</h3><p>This card has a check icon in its heading. The check glyph is part of the text flow and renders via windfoil.</p><span class="label green">Complete</span></div>
    <div class="card"><h3>* Starred</h3><p>Icon + text combos work because icons are regular characters in the glyph atlas.</p><span class="label accent">Featured</span></div>
  </div>
  <h2>Inline code + keys</h2>
  <p>Type <code>npm run dev</code> and press <span class="kbd">F5</span> to reload. The <code>buildCSS</code> function generates a full stylesheet from a <span class="text-accent">palette object</span>.</p>
  <div class="well">
    <div class="section-title">Tip</div>
    <p>Any Unicode character added to the atlas renders via windfoil. Characters missing from the font will simply not draw &mdash; no errors, no fallback.</p>
  </div>
  <div class="btn-row"><div class="btn jump" data-page="7">Next: Blog</div></div>
  <p class="footer">Windfoil &middot; Components page</p>
</div>`
,
`<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Showcase</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">Blog</div>
    <h1>Notes from the forge.</h1>
  </div>
  <div class="card">
    <div class="section-title">June 2026</div>
    <h3>Why analytic coverage beats MSAA</h3>
    <p>Multi-sample anti-aliasing samples the coverage function at fixed grid points. Analytic coverage evaluates the exact winding number integral in closed form. The result: zero aliasing at any zoom level, not just at 1x. Windfoil computes the signed area of the intersection between each curve segment and the pixel footprint, producing a coverage value that is mathematically exact.</p>
    <div class="tag">rendering</div><div class="tag">GPU</div>
  </div>
  <div class="card">
    <div class="section-title">May 2026</div>
    <h3>Building a CSS engine from scratch</h3>
    <p>The CSS engine in windfoil parses stylesheets into a flat rule list. Selectors are matched against the element tree using a custom walk that supports class, tag, ID, and descendant combinators. Pseudo-classes like :hover and :active are resolved at hit-test time, not at parse time. This means the same rule list drives both the normal and hovered appearance of every element.</p>
    <div class="tag">CSS</div><div class="tag">architecture</div>
  </div>
  <div class="card">
    <div class="section-title">April 2026</div>
    <h3>Glyph banding: the key to performance</h3>
    <p>Each glyph is decomposed into monotone quadratic segments, then sorted into horizontal bands. The GPU shader only evaluates bands that overlap the current pixel row. This reduces the per-pixel work from O(n) to O(n / B) where B is the band count. For a typical 16px glyph, bands cut the shader workload by 4-8x.</p>
    <div class="tag">performance</div><div class="tag">atlas</div>
  </div>
  <div class="card">
    <div class="section-title">March 2026</div>
    <h3>One draw call to rule them all</h3>
    <p>Every visible element &mdash; backgrounds, glyphs, shadows, animations &mdash; is packed into a single instance buffer and rendered in one GPU draw call. There are no texture lookups for text, no separate passes for shadows. The vertex shader positions each instance; the fragment shader evaluates the analytic coverage integral. This keeps the GPU pipeline fully saturated with minimal state changes.</p>
    <div class="tag">pipeline</div><div class="tag">GPU</div>
  </div>
  <div class="card">
    <div class="section-title">February 2026</div>
    <h3>Transition interpolation in JavaScript</h3>
    <p>CSS transitions are interpolated in the frame loop using exponential easing. The curBg property of each element is lerped toward its target (normal or hover) at a rate determined by dt. This produces smooth 60fps transitions without a CSS animation engine. The same approach works for shadows, transforms, and any other animatable property.</p>
    <div class="tag">animation</div><div class="tag">JavaScript</div>
  </div>
  <h2>Technical deep dives</h2>
  <div class="split">
    <div class="card">
      <h3>Winding number math</h3>
      <p>The winding number counts how many times a curve wraps around a point. For a quadratic bezier, the integral over the pixel footprint reduces to a closed-form expression involving the curve control points and the pixel corners. No numerical integration is needed.</p>
    </div>
    <div class="card">
      <h3>Band sorting strategy</h3>
      <p>Bands are sorted by x-extent in descending order. This ensures that the most influential curves are evaluated first, allowing early termination when the accumulated coverage saturates. The sort uses insertion sort for small bands (fewer than 5 pieces) and quicksort for larger ones.</p>
    </div>
  </div>
  <div class="well">
    <div class="section-title">Subscribe</div>
    <p>Follow the windfoil project for updates on rendering techniques, performance improvements, and new features.</p>
    <div class="btn-row"><div class="btn">Follow updates</div><div class="btn ghost">RSS feed</div></div>
  </div>
  <div class="btn-row"><div class="btn jump" data-page="8">Next: Pricing</div></div>
  <p class="footer">Windfoil &middot; Blog page</p>
</div>`
,
`<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Pricing</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">Pricing</div>
    <h1>Simple, transparent pricing.</h1>
    <p class="lead">Windfoil is open source. Use it free in personal and commercial projects. No hidden fees, no usage limits.</p>
  </div>
  <div class="grid">
    <div class="card" style="border:2px solid #4466cc;">
      <div class="section-title">Open source</div>
      <h3>Free forever</h3>
      <p>Full access to the GPU renderer, CSS engine, and all components. MIT licensed. Use in unlimited projects.</p>
      <div class="divider"></div>
      <ul><li>Full CSS selector matching</li><li>Hover and active pseudo-classes</li><li>Analytic coverage shader</li><li>Glyph banding engine</li><li>One draw call rendering</li></ul>
      <div class="btn-row"><div class="btn">Get started</div></div>
    </div>
    <div class="card">
      <div class="section-title">Enterprise</div>
      <h3>Custom support</h3>
      <p>Priority support, custom integrations, and performance tuning for production deployments.</p>
      <div class="divider"></div>
      <ul><li>Everything in Open source</li><li>Priority issue resolution</li><li>Custom shader modifications</li><li>Performance audit</li><li>Integration consulting</li></ul>
      <div class="btn-row"><div class="btn ghost">Contact us</div></div>
    </div>
  </div>
  <h2>Feature comparison</h2>
  <div class="table">
    <div class="row head"><div class="cell">Feature</div><div class="cell">Open source</div><div class="cell">Enterprise</div></div>
    <div class="row body"><div class="cell">GPU renderer</div><div class="cell">v Included</div><div class="cell">v Included</div></div>
    <div class="row body"><div class="cell">CSS engine</div><div class="cell">v Included</div><div class="cell">v Included</div></div>
    <div class="row body"><div class="cell">Analytic AA</div><div class="cell">v Included</div><div class="cell">v Included</div></div>
    <div class="row body"><div class="cell">Priority support</div><div class="cell">x Community</div><div class="cell">v 24h response</div></div>
    <div class="row body"><div class="cell">Custom shaders</div><div class="cell">x DIY</div><div class="cell">v Assisted</div></div>
    <div class="row body"><div class="cell">Performance audit</div><div class="cell">x No</div><div class="cell">v Full report</div></div>
  </div>
  <div class="callout"><div><h3>Questions?</h3><p>Reach out to the team for any questions about licensing, deployment, or custom integrations.</p></div></div>
  <div class="btn-row"><div class="btn jump" data-page="9">Next: FAQ</div></div>
  <p class="footer">Windfoil &middot; Pricing page</p>
</div>`
,
`<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>FAQ</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">FAQ</div>
    <h1>Common questions, answered.</h1>
  </div>
  <div class="card">
    <h3>How does windfoil achieve zero aliasing?</h3>
    <p>Traditional rasterizers use MSAA or supersampling to approximate coverage. Windfoil computes the exact winding number integral for each pixel using a closed-form expression derived from the quadratic bezier curve equations. This means the coverage value is mathematically precise regardless of zoom level or font size. There are no sampling artifacts because there are no samples &mdash; just integrals.</p>
  </div>
  <div class="card">
    <h3>Why one draw call instead of many?</h3>
    <p>Each draw call has overhead: state changes, command buffer encoding, GPU pipeline switches. By packing all instances into a single buffer and rendering them in one call, windfoil eliminates this overhead entirely. The vertex shader selects the correct curve data per instance, and the fragment shader evaluates coverage. The GPU's parallel architecture handles the rest.</p>
  </div>
  <div class="card">
    <h3>What browsers are supported?</h3>
    <p>Windfoil requires WebGPU support. As of 2026, this includes Chrome 113+, Edge 113+, and Firefox Nightly with the webgpu flag enabled. Safari的技术预览版 also has experimental support. The CSS engine and layout system work in any modern browser; only the rendering pipeline requires WebGPU.</p>
  </div>
  <div class="card">
    <h3>Can I use custom fonts?</h3>
    <p>Yes. Windfoil loads TrueType fonts via opentype.js and builds a glyph atlas at startup. Any font that opentype.js can parse will work. The atlas includes monotone curve segments, bounding boxes, and advance widths for every glyph used in the document. Characters not present in the font simply won't render &mdash; no fallback needed.</p>
  </div>
  <div class="card">
    <h3>How does the CSS engine differ from browser CSS?</h3>
    <p>Windfoil's CSS engine is a simplified implementation designed for the GPU renderer. It supports class, tag, and ID selectors with descendant combinators. Pseudo-classes (:hover, :active) are resolved at hit-test time. It does not support media queries, animations via @keyframes, or complex selectors like :nth-child. The focus is on the subset needed for rich document layouts.</p>
  </div>
  <div class="card">
    <h3>What is the performance like?</h3>
    <p>On a modern GPU, windfoil can render thousands of instances per frame at 120fps. The main bottleneck is the glyph banding pre-pass on the CPU, which runs once at startup. The GPU workload scales with the number of visible pixels and the complexity of the curve geometry. For typical document layouts, the per-frame GPU time is under 2ms.</p>
  </div>
  <div class="card">
    <h3>How do I add new CSS classes?</h3>
    <p>Add your class styles to the buildCSS function. This function generates a complete stylesheet from a palette object. The JS CSS parser then resolves these rules at layout time. For pseudo-class states, add :hover and :active variants. The transition system will interpolate between them automatically.</p>
  </div>
  <div class="card">
    <h3>Is windfoil production-ready?</h3>
    <p>Windfoil is actively developed and used in several production applications. The core rendering pipeline is stable and well-tested. The CSS engine covers the most common layout patterns. For critical applications, the enterprise support plan includes priority bug fixes and performance optimization.</p>
  </div>
  <div class="cta"><h3>Still have questions?</h3><p>Open an issue on GitHub or reach out to the community.</p><div class="btn">Open an issue</div></div>
  <div class="btn-row"><div class="btn jump" data-page="10">Next: Playground</div></div>
  <p class="footer">Windfoil &middot; FAQ page</p>
</div>`
,
`<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Playground</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">Playground</div>
    <h1>Try every component.</h1>
  </div>
  <div class="section-title">Alert banners</div>
  <div class="alert"><div>v System check passed. All rendering pipelines operational.</div></div>
  <div class="section-title">Inline formatting</div>
  <p>This paragraph demonstrates <span class="text-accent">accent text</span>, <span class="text-muted">muted text</span>, <code>inline code</code>, and <span class="kbd">keyboard shortcuts</span> all flowing together in a single line of body text.</p>
  <div class="section-title">Blockquotes</div>
  <blockquote>"The best rendering is the one you don't notice." &mdash; Every graphics programmer ever</blockquote>
  <blockquote>"Analytic coverage is not a feature, it's a foundation." &mdash; Windfoil design doc</blockquote>
  <div class="section-title">Description lists</div>
  <dl class="list-desc">
    <dt>Curve atlas</dt><dd>A pre-computed lookup table of monotone quadratic segments, band headers, and row tables for every glyph in the document.</dd>
    <dt>Instance buffer</dt><dd>A flat array of 16 floats per instance: position, bounding box, color, and band metadata. Filled by the CPU, consumed by the GPU vertex shader.</dd>
    <dt>Coverage integral</dt><dd>The closed-form expression evaluated per pixel in the fragment shader. Returns a value in [0,1] representing the fraction of the pixel covered by the glyph or rect.</dd>
  </dl>
  <div class="section-title">Split layouts</div>
  <div class="split">
    <div class="card"><h3>Left</h3><p>Flex-based split with equal widths.</p></div>
    <div class="card"><h3>Right</p><p>Both panels share the available space.</p></div>
  </div>
  <div class="section-title">Multiple grids</div>
  <div class="grid">
    <div class="feature"><h3>Grid 1</h3><p>Three-column flex layout with gap spacing.</p></div>
    <div class="feature"><h3>Grid 2</h3><p>Each column is a flex child with equal width.</p></div>
    <div class="feature"><h3>Grid 3</h3><p>Responsive to the parent container width.</p></div>
  </div>
  <div class="section-title">Nested content</div>
  <div class="card">
    <h3>Card with nested elements</h3>
    <p>This card contains tags, a divider, and a button.</p>
    <div style="margin:12px 0;"><span class="tag">nested</span><span class="tag">complex</span><span class="tag">layout</span></div>
    <div class="divider"></div>
    <p>After the divider, we have more text and an action button.</p>
    <div class="btn-row"><div class="btn small">Action</div><div class="btn small ghost">Cancel</div></div>
  </div>
  <div class="section-title">Avatar group</div>
  <div class="avatars">
    <div class="avatar">A</div><div class="avatar">B</div><div class="avatar">C</div><div class="avatar">D</div><div class="avatar">E</div><div class="avatar">F</div>
  </div>
  <div class="section-title">Badge collection</div>
  <div class="badges">
    <div class="badge">v1.0</div><div class="badge">GPU</div><div class="badge">WebGPU</div><div class="badge">Analytic</div><div class="badge">AA</div><div class="badge">Open source</div><div class="badge">MIT</div><div class="badge">TypeScript</div>
  </div>
  <div class="section-title">Status indicators</div>
  <div class="split">
    <div><div class="status ok">Build passing</div></div>
    <div><div class="pulse">Live -- 60 fps</div></div>
  </div>
  <div class="section-title">Code blocks</div>
  <pre>// Windfoil instance format (16 floats per instance):
// [0-1] control point (unused for rects)
// [2-3] mid-point (unused for rects)
// [4-7] bounding box: x0, y0, x1, y1
// [8-11] RGBA color (premultiplied)
// [12] row base index into the row table
// [13] band count
// [14-15] y0, inverse height for band lookup
const INSTANCE_STRIDE = 16;</pre>
  <pre>function coverage(px: vec2f, crv: Curve) -> f32 {
  // Closed-form winding number integral
  // for a quadratic bezier segment
  let ax = crv.p0.x - 2.0 * crv.c.x + crv.p1.x;
  let ay = crv.p0.y - 2.0 * crv.c.y + crv.p1.y;
  let bx = 2.0 * (crv.c.x - crv.p0.x);
  let by = 2.0 * (crv.c.y - crv.p0.y);
  // ... evaluate integral bounds
  return min(abs(winding), 1.0);
}</pre>
  <div class="cta"><h3>Explore everything</h3><p>Scroll-zoom to see how every component renders at any scale.</p><div class="btn jump" data-page="0">Back to home</div></div>
  <p class="footer">Windfoil &middot; Playground page</p>
</div>`
,
];
export const HTML_SRC = PAGES.join('\n');
