import test from "node:test";
import assert from "node:assert/strict";
import extension from "../index.ts";

test("insights tool projects summary and text without details", () => {
 let tool:any; extension({registerTool:(x:any)=>tool=x,registerCommand:()=>{}} as any);
 const theme={fg:(_:string,s:string)=>s}; const r={content:[{type:"text",text:"Today\n\nBody"}],details:{secret:"x"}};
 assert.match(tool.renderResult(r,{expanded:false,isPartial:false},theme).render(80).join("\n"),/Today/);
 assert.match(tool.renderResult(r,{expanded:true,isPartial:false},theme).render(80).join("\n"),/Body/);
});
