
import { useState, useEffect, useMemo } from 'react';
import { X, Search, ChevronDown, ChevronRight, Shield, Backpack, Swords, Sparkles, Sprout, Briefcase, Plus, Flame, Sun, CircleDollarSign, ArrowRight, Target } from 'lucide-react';
import { useConfig } from '@/app/ui/context/ConfigContext';
import { dataManager } from '../../data/DataManager';

interface GearSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (itemData: any) => Promise<void>;
}

type GearCategory = 'Armor' | 'Basic Gear' | 'Herbal Remedies' | 'Starting Gear' | 'Weapons' | 'Magic Items';

// Property mapping from properties.db
const PROPERTY_MAP: Record<string, string> = {
    "WhfSBiji8VG1mMzV": "Disadvantage (Stealth)",
    "qEIYaQ9j2EUmSrx6": "Versatile",
    "rqQwpoeWEqi0ZcYK": "Finesse",
    "R9rw4pKdIHfJJoyJ": "Returning",
    "e5RpI0crHweCVt8B": "Breakable",
    "F4wv0ycualMPaoco": "Disadvantage (Swim)",
    "vobaPJfoZ1e50eab": "Blowgun",
    "bAzl6RH1PW95ZkFE": "Sundering",
    "jq0m0lGb7QOCSJXL": "Occupies One Hand",
    "M5iKSTKd3UgtZT8K": "Shuriken",
    "K5d1agm6gzaTLr1k": "Lash",
    "61gM0DuJQwLbIBwu": "Shield",
    "c35ROL1nXwC840kC": "Thrown",
    "Op1yKvM7uq5pdopr": "Sundering",
    "b6Gm2ULKj2qyy2xJ": "Two-Handed",
    "98zYioBHqik74KBV": "Bolas",
    "kBLs47xhX1snaDGA": "No Swim",
    "HyqHR9AhIDkm4La9": "Loading"
};

const FOLDER_IDS: Record<string, GearCategory> = {
    'np4FRJ73NRBEQKnS': 'Armor',
    '0ws7y8D3IktigkiB': 'Basic Gear',
    'LVzvIhYHieRT4O6q': 'Weapons',
    'iHOSxtXRWKd2vx1U': 'Herbal Remedies',
    'aDuF91SrY1z6oZoL': 'Starting Gear'
};

export default function GearSelectionModal({ isOpen, onClose, onCreate }: GearSelectionModalProps) {
    const { resolveImageUrl } = useConfig();
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedCategories, setExpandedCategories] = useState<Set<GearCategory>>(new Set(['Basic Gear']));
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen && items.length === 0) {
            setLoading(true);
            const fetchData = async () => {
                try {
                    // Fetch from API because DataManager is server-side only
                    const response = await fetch('/api/modules/shadowdark/gear/list');
                    if (!response.ok) throw new Error(`API Error: ${response.status}`);
                    const allDocs = await response.json();

                    console.log('[GearSelectionModal] Fetched docs:', allDocs.length);

                    const gearItems = allDocs.filter((d: any) => {
                        // Filter out non-items or folders
                        if (d.type === 'Item' && d._key && d._key.startsWith('!folders!')) return false;

                        // Filter out effects/bonuses from magic-items.db
                        const validTypes = ['Basic', 'Weapon', 'Armor', 'Potion', 'Scroll'];
                        if (!d.type || !validTypes.includes(d.type)) return false;

                        // Check specific packs
                        if (d.pack === 'gear' || d.pack === 'magic-items') return true;
                        return false;
                    });
                    setItems(gearItems);
                } catch (e) {
                    console.error("Failed to load gear", e);
                } finally {
                    setLoading(false);
                }
            };
            fetchData();
        }
    }, [isOpen]);

    const toggleCategory = (category: GearCategory) => {
        const newSet = new Set(expandedCategories);
        if (newSet.has(category)) {
            newSet.delete(category);
        } else {
            newSet.add(category);
        }
        setExpandedCategories(newSet);
    };

    const categorizedItems = useMemo(() => {
        const categories: Record<GearCategory, any[]> = {
            'Basic Gear': [],
            'Armor': [],
            'Weapons': [],
            'Herbal Remedies': [],
            'Starting Gear': [],
            'Magic Items': []
        };

        items.forEach(item => {
            // Search Filter
            if (searchTerm && !item.name.toLowerCase().includes(searchTerm.toLowerCase())) {
                return;
            }

            // Category Logic
            let category: GearCategory | null = null;

            if (item.pack === 'magic-items' || item.system?.magicItem === true) {
                category = 'Magic Items';
            } else if (item.folder && FOLDER_IDS[item.folder]) {
                category = FOLDER_IDS[item.folder];
            } else if (item.type === 'Armor') {
                category = 'Armor';
            } else if (item.type === 'Weapon') {
                category = 'Weapons';
            } else {
                // Fallback for items in gear.db without a folder (if any)
                if (item.pack === 'gear') category = 'Basic Gear';
            }

            if (category) {
                categories[category].push(item);
            }
        });

        // Sort items within categories
        Object.keys(categories).forEach(key => {
            categories[key as GearCategory].sort((a: any, b: any) => a.name.localeCompare(b.name));
        });

        return categories;
    }, [items, searchTerm]);

    if (!isOpen) return null;

    const CategoryIcon = ({ category }: { category: GearCategory }) => {
        switch (category) {
            case 'Armor': return <Shield size={18} className="text-neutral-400" />;
            case 'Basic Gear': return <Backpack size={18} className="text-neutral-400" />;
            case 'Herbal Remedies': return <Sprout size={18} className="text-neutral-400" />;
            case 'Starting Gear': return <Briefcase size={18} className="text-neutral-400" />;
            case 'Weapons': return <Swords size={18} className="text-neutral-400" />;
            case 'Magic Items': return <Sparkles size={18} className="text-neutral-400" />;
        }
    };

    const handleAdd = async (item: any) => {
        // Clone item data to create a new instance
        const newItemData = {
            name: item.name,
            type: item.type,
            img: item.img,
            system: JSON.parse(JSON.stringify(item.system))
        };

        // Reset specific fields for a new distinct item
        // newItemData.system.equipped = false; // Usually false by default
        // newItemData.system.stashed = false;

        await onCreate(newItemData);
        // Optional: show toast or feedback
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-neutral-100 w-full max-w-4xl h-[85vh] flex flex-col border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">

                {/* Header */}
                <div className="bg-black text-white p-4 flex justify-between items-center shrink-0">
                    <h2 className="font-serif font-bold text-xl uppercase tracking-widest flex items-center gap-2">
                        <Backpack size={24} />
                        Gear Selection
                    </h2>
                    <button onClick={onClose} className="hover:text-red-400 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Sub-header / Search */}
                <div className="p-4 border-b-2 border-neutral-300 bg-white shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search gear..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-neutral-300 bg-neutral-50 rounded-sm focus:border-black focus:ring-1 focus:ring-black outline-none font-serif"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loading ? (
                        <div className="flex justify-center items-center h-full">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
                        </div>
                    ) : (
                        (Object.keys(categorizedItems) as GearCategory[]).map(category => {
                            const itemsInCategory = categorizedItems[category];
                            if (itemsInCategory.length === 0) return null;

                            const isExpanded = expandedCategories.has(category);

                            return (
                                <div key={category} className="bg-white border-2 border-neutral-200">
                                    <button
                                        onClick={() => toggleCategory(category)}
                                        className="w-full flex items-center justify-between p-3 bg-neutral-100 hover:bg-neutral-200 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                            <CategoryIcon category={category} />
                                            <span className="font-serif font-bold uppercase tracking-wide text-sm">{category}</span>
                                            <span className="bg-neutral-300 text-neutral-600 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                                {itemsInCategory.length}
                                            </span>
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="divide-y divide-neutral-100">
                                            {/* Column Headers */}
                                            <div className="grid grid-cols-12 gap-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400 px-4 py-2 border-b border-neutral-100">
                                                <div className="col-span-4 pl-12">Name</div>
                                                <div className="col-span-2 text-center">Cost</div>
                                                <div className="col-span-1 text-center">Slots</div>
                                                <div className="col-span-1 text-center">Type</div>
                                                <div className="col-span-3 text-center">Properties</div>
                                                <div className="col-span-1 text-center">Add</div>
                                            </div>

                                            {itemsInCategory.map((item: any) => {
                                                const isWeapon = item.type === 'Weapon';
                                                const isArmor = item.type === 'Armor';
                                                const properties = [];

                                                if (isArmor && item.system?.ac?.base) {
                                                    let acLabel = `AC ${item.system.ac.base}`;
                                                    if (item.system.ac.modifier) acLabel += ` +${item.system.ac.modifier}`;
                                                    properties.push({ label: acLabel, color: 'bg-zinc-200 text-zinc-700' });
                                                }

                                                if (isWeapon) {
                                                    if (item.system?.type) {
                                                        properties.push({ label: item.system.type, color: 'bg-zinc-200 text-zinc-700' }); // Melee/Ranged
                                                    }
                                                    if (item.system?.range) {
                                                        properties.push({ label: item.system.range, color: 'bg-blue-100 text-blue-700' }); // Close/Near etc
                                                    }
                                                }

                                                // Generic Properties from property map
                                                if (item.system?.properties && Array.isArray(item.system.properties)) {
                                                    item.system.properties.forEach((propId: string) => {
                                                        // Extract UUID part if it is a full path (Compendium...)
                                                        const parts = propId.split('.');
                                                        const id = parts[parts.length - 1];
                                                        const propName = PROPERTY_MAP[id];
                                                        if (propName) {
                                                            properties.push({ label: propName, color: 'bg-slate-700 text-white' });
                                                        }
                                                    });
                                                }

                                                return (
                                                    <div key={item._id} className="grid grid-cols-12 gap-2 p-3 items-stretch hover:bg-neutral-50 group">

                                                        {/* Name & Description Column */}
                                                        <div className="col-span-4 flex gap-3 items-start relative">
                                                            <div className="w-12 h-12 border border-neutral-300 bg-neutral-100 shrink-0">
                                                                <img src={resolveImageUrl(item.img)} alt={item.name} className="w-full h-full object-cover" />
                                                            </div>
                                                            <div className="min-w-0 flex flex-col justify-center h-full gap-1">
                                                                <div className="font-bold font-serif text-lg leading-tight truncate">{item.name}</div>
                                                                {/* Description */}
                                                                <div
                                                                    className="text-[11px] text-neutral-500 line-clamp-2 leading-tight"
                                                                    dangerouslySetInnerHTML={{ __html: item.system?.description || '' }}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Cost Column */}
                                                        <div className="col-span-2 flex items-center justify-center font-mono text-sm text-neutral-600">
                                                            {item.system?.cost?.gp > 0 && <span>{item.system.cost.gp} gp</span>}
                                                            {item.system?.cost?.sp > 0 && <span>{item.system.cost.sp} sp</span>}
                                                            {item.system?.cost?.cp > 0 && <span>{item.system.cost.cp} cp</span>}
                                                            {(!item.system?.cost?.gp && !item.system?.cost?.sp && !item.system?.cost?.cp) && <span>-</span>}
                                                        </div>

                                                        {/* Slots Column */}
                                                        <div className="col-span-1 flex items-center justify-center">
                                                            <span className="font-bold bg-neutral-200 text-neutral-700 rounded px-2 py-0.5 text-xs">
                                                                {item.system?.slots?.slots_used || 0}
                                                            </span>
                                                        </div>

                                                        {/* Type Icons Column */}
                                                        <div className="col-span-1 flex items-center justify-center gap-1.5">
                                                            {item.system?.isAmmunition && <span title="Ammunition" className="text-orange-500"><Target size={20} /></span>}
                                                            {item.system?.light?.isSource && <span title="Light Source" className="text-yellow-600"><Flame size={20} /></span>}
                                                            {item.system?.magicItem && <span title="Magic Item" className="text-purple-600"><Sparkles size={20} /></span>}
                                                            {item.system?.treasure && <span title="Treasure" className="text-amber-500"><Sun size={20} /></span>}
                                                        </div>

                                                        {/* Properties Column */}
                                                        <div className="col-span-3 flex flex-wrap gap-1 content-center">
                                                            {properties.map((prop, idx) => (
                                                                <span key={idx} className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm whitespace-nowrap ${prop.color}`}>
                                                                    {prop.label}
                                                                </span>
                                                            ))}
                                                        </div>

                                                        {/* Add Button Column */}
                                                        <div className="col-span-1 flex items-stretch">
                                                            <button
                                                                onClick={() => handleAdd(item)}
                                                                className="w-full bg-black text-white hover:bg-neutral-800 transition-colors rounded-sm flex items-center justify-center"
                                                                title="Add to Inventory"
                                                            >
                                                                <Plus size={20} strokeWidth={3} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Key - Color Coded */}
                <div className="p-3 border-t border-neutral-300 bg-neutral-50 text-xs flex gap-6 justify-center">
                    <span className="flex items-center gap-1.5 text-orange-500 font-bold"><Target size={16} /> Ammunition</span>
                    <span className="flex items-center gap-1.5 text-yellow-600 font-bold"><Flame size={16} /> Light Source</span>
                    <span className="flex items-center gap-1.5 text-purple-600 font-bold"><Sparkles size={16} /> Magic Item</span>
                    <span className="flex items-center gap-1.5 text-amber-500 font-bold"><Sun size={16} /> Treasure</span>
                </div>
            </div>
        </div>
    );
}
