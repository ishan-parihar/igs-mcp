import fs from 'node:fs/promises';

const file = '/home/ishanp/Documents/GitHub/IGS/config/sources.yml';
let txt = await fs.readFile(file, 'utf8');

// Quote Haaretz names and fix ampersand in URL
txt = txt.replace(/^(\s+name: )(Haaretz: Latest Headlines)$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(Haaretz: World News)$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(Haaretz: Opinion)$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(Haaretz: Life & Culture)$/m, '$1"$2"');
txt = txt.replace(/^(\s+url: )(https:\/\/www\.haaretz\.com\/srv\/life-&-culture-rss)$/m, '$1"$2"');

// Also quote any other names with colons or special chars
txt = txt.replace(/^(\s+name: )(MIT Technology Review)$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(Economic Times India)$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(BBC World News)$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(BBC News India)$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(US CISA Alerts)$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(US Space Force CFC News)$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(Reuters \(via Google News\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(Reuters India)$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(Financial Times)$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(European Council on Foreign Relations)$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(Aeon\.co)$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(The Hindu \(National\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(The Hindu \(World\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(Indian Express \(National\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(Indian Express \(World\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(Indian Express \(South\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(Indian Express \(East\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(Indian Express \(North East\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(Indian Express \(Delhi\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(Indian Express \(Mumbai\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(Indian Express \(Bengaluru\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(The Hindu \(Karnataka\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(The Hindu \(Tamil Nadu\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(The Hindu \(Kerala\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(The Hindu \(Andhra Pradesh\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(The Hindu \(Telangana\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(The Hindu \(Delhi\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(The Hindu \(Mumbai\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(The Hindu \(Bengaluru\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(The Hindu \(Chennai\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(The Hindu \(Hyderabad\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(The Hindu \(Kolkata\))$/m, '$1"$2"');
txt = txt.replace(/^(\s+name: )(WHO Disease Outbreak News)$/m, '$1"$2"');

await fs.writeFile(file, txt, 'utf8');
console.log('Fixed YAML quoting issues in sources.yml');
