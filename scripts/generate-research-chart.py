from pathlib import Path
import base64,io
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
fig,axes=plt.subplots(2,1,figsize=(9,5.6),dpi=160)
fig.patch.set_facecolor('#f6f8fa')
for ax in axes:ax.set_facecolor('#f6f8fa');ax.spines[['top','right']].set_visible(False)
axes[0].barh(['Baseline','Optimized'],[120,70],color=['#aab5c0','#28776e'],height=.5)
axes[0].set_xlim(0,145);axes[0].invert_yaxis();axes[0].set_title('P95 latency (ms) — lower is better',loc='left',fontsize=12)
for i,v in enumerate([120,70]):axes[0].text(v+2,i,str(v),va='center')
axes[1].barh(['Baseline','Optimized'],[1000,1800],color=['#aab5c0','#28776e'],height=.5)
axes[1].set_xlim(0,2200);axes[1].invert_yaxis();axes[1].set_title('Throughput (req/s) — higher is better',loc='left',fontsize=12)
for i,v in enumerate([1000,1800]):axes[1].text(v+30,i,str(v),va='center')
fig.suptitle('R&D benchmark · demonstration data',fontsize=15,x=.12,ha='left')
fig.tight_layout(pad=2);out=io.BytesIO();fig.savefig(out,format='png',facecolor=fig.get_facecolor());plt.close(fig)
Path('src/research-assets.ts').write_text('// Embedded benchmark illustration; all values are demonstration data.\nexport const researchAssets:Record<string,string>={"assets/research-benchmark.png":"data:image/png;base64,'+base64.b64encode(out.getvalue()).decode()+'"};\n')
