// Basic Roll implementation for client-side evaluation
export class Roll {
    private _formula: string;
    private _data: any;
    private _total: number | undefined;
    private _evaluated: boolean = false;
    private _terms: any[] = [];

    constructor(formula: string, data: any = {}) {
        this._formula = formula;
        this._data = data;
    }

    get total(): number | undefined {
        return this._total;
    }

    get formula(): string {
        return this._formula;
    }

    async evaluate({ minimize = false, maximize = false } = {}): Promise<Roll> {
        if (this._evaluated) return this;

        // basic parser: split by space for now, improve regex later if needed
        // handling simple "NdX + M" or "NdX"
        // TODO: A real parser is complex, we will implement a robust regex parser here.

        this._terms = [];
        let total = 0;

        // Regex to match: (Dice: 1d6) OR (Operator: + - * /) OR (Number: 5)
        // Group 1: Dice (e.g. 1d6, 2d20)
        // Group 2: Operator
        // Group 3: Number
        const regex = /([0-9]+d[0-9]+)|([+\-*\/])|([0-9]+)/g;

        // We need to tokenize the formula
        // Remove spaces for easier parsing or handle them
        const cleanFormula = this._formula.replace(/\s/g, '');

        let match;
        let lastIndex = 0;

        // Simple arithmetic evaluator tokens
        const evalTokens: (number | string)[] = [];

        while ((match = regex.exec(cleanFormula)) !== null) {
            // Dice Term
            if (match[1]) {
                const parts = match[1].split('d');
                const count = parseInt(parts[0]) || 1;
                const faces = parseInt(parts[1]) || 6;
                const results = [];
                let subTotal = 0;

                for (let i = 0; i < count; i++) {
                    let res = Math.floor(Math.random() * faces) + 1;
                    if (minimize) res = 1;
                    if (maximize) res = faces;
                    results.push({ result: res, active: true });
                    subTotal += res;
                }

                this._terms.push({
                    class: "Die",
                    formula: match[1],
                    number: count,
                    faces: faces,
                    results: results,
                    options: {}
                });
                evalTokens.push(subTotal);
            }
            // Operator Term
            else if (match[2]) {
                this._terms.push({
                    class: "OperatorTerm",
                    formula: match[2],
                    operator: match[2],
                    options: {}
                });
                evalTokens.push(match[2]);
            }
            // Numeric Term
            else if (match[3]) {
                const num = parseInt(match[3]);
                this._terms.push({
                    class: "NumericTerm",
                    formula: match[3],
                    number: num,
                    options: {}
                });
                evalTokens.push(num);
            }
        }

        // Evaluate the token stream (basic left-to-right with precedence handling is hard, 
        // strictly for this feature we will use Function constructor or simple eval 
        // BUT strict constraint: verify safe tokens only).
        // Since we constructed evalTokens strictly from parsed numbers and known operators, it is safe-ish.

        // Construct string
        const evalString = evalTokens.join(' ');
        try {
            // Basic safety check: only allow numbers and operators
            if (/^[\d\s+\-*\/().]+$/.test(evalString)) {
                // eslint-disable-next-line no-new-func
                this._total = new Function(`return ${evalString}`)();
            } else {
                this._total = 0; // unsafe
            }
        } catch (e) {
            this._total = 0;
        }

        this._evaluated = true;
        return this;
    }

    toJSON(): any {
        return {
            class: "Roll",
            options: {},
            formula: this._formula,
            terms: this._terms,
            total: this._total,
            evaluated: this._evaluated
        };
    }
}
