"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MaterialInventory, ProductMaterialUsage } from "@/types/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createBomEntryAction, deleteBomEntryAction, updateBomEntryAction } from "../actions";

type BomRow = ProductMaterialUsage;

export function BomTableClient(props: { materials: MaterialInventory[]; bomRows: BomRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState("");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<BomRow | null>(null);

  const materialMap = useMemo(() => new Map(props.materials.map((m) => [m.id, m])), [props.materials]);

  const filteredRows = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return props.bomRows;
    return props.bomRows.filter((row) => {
      const mat = materialMap.get(row.material_id);
      return (
        (row.product_type || "").toLowerCase().includes(q) ||
        (row.size || "").toLowerCase().includes(q) ||
        (mat?.name || "").toLowerCase().includes(q)
      );
    });
  }, [materialMap, props.bomRows, searchValue]);

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      const result = await createBomEntryAction(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Recipe added");
      setIsAddOpen(false);
      router.refresh();
    });
  }

  function handleEdit(formData: FormData) {
    startTransition(async () => {
      const result = await updateBomEntryAction(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Recipe updated");
      setIsEditOpen(false);
      router.refresh();
    });
  }

  function handleDelete(formData: FormData) {
    startTransition(async () => {
      const result = await deleteBomEntryAction(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Recipe deleted");
      setIsDeleteOpen(false);
      setSelectedRow(null);
      router.refresh();
    });
  }

  function renderUsageSummary(row: BomRow) {
    const mat = materialMap.get(row.material_id);
    const onHand = Number(mat?.qty_on_hand ?? 0);
    const per = Number(row.qty_per_unit ?? 0);
    if (!mat || !per || per <= 0) return "—";
    const possible = Math.floor(onHand / per);
    return String(possible);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Search product, size, material..."
          className="max-w-md"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Recipe
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Recipe</DialogTitle>
            </DialogHeader>
            <form action={handleAdd} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="productType">Product Type</Label>
                <Input id="productType" name="productType" required placeholder="e.g. Hoodie" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="size">Size (optional)</Label>
                <Input id="size" name="size" placeholder="e.g. S, M, L" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="materialId">Material</Label>
                <Select name="materialId" required>
                  <SelectTrigger id="materialId">
                    <SelectValue placeholder="Select material" />
                  </SelectTrigger>
                  <SelectContent>
                    {props.materials.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} ({m.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="qtyPerUnit">Qty per Unit</Label>
                <Input id="qtyPerUnit" name="qtyPerUnit" type="number" step="0.0001" required placeholder="0.00" />
              </div>
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "Saving..." : "Save Recipe"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Material</TableHead>
              <TableHead className="text-right">Qty / Unit</TableHead>
              <TableHead className="text-right">Usage Summary</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No recipes found. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => {
                const mat = materialMap.get(row.material_id);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.product_type}</TableCell>
                    <TableCell className="text-muted-foreground">{row.size || "—"}</TableCell>
                    <TableCell>{mat ? `${mat.name} (${mat.unit})` : row.material?.name || "Unknown"}</TableCell>
                    <TableCell className="text-right">
                      {row.qty_per_unit} {mat?.unit || row.material?.unit || ""}
                    </TableCell>
                    <TableCell className="text-right">{renderUsageSummary(row)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedRow(row);
                            setIsEditOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setSelectedRow(row);
                            setIsDeleteOpen(true);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Recipe</DialogTitle>
          </DialogHeader>
          {selectedRow && (
            <form action={handleEdit} className="space-y-4">
              <input type="hidden" name="id" value={selectedRow.id} />
              <div className="grid gap-2">
                <Label htmlFor="edit-productType">Product Type</Label>
                <Input id="edit-productType" name="productType" required defaultValue={selectedRow.product_type} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-size">Size (optional)</Label>
                <Input id="edit-size" name="size" defaultValue={selectedRow.size || ""} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-materialId">Material</Label>
                <Select name="materialId" required defaultValue={selectedRow.material_id}>
                  <SelectTrigger id="edit-materialId">
                    <SelectValue placeholder="Select material" />
                  </SelectTrigger>
                  <SelectContent>
                    {props.materials.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} ({m.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-qtyPerUnit">Qty per Unit</Label>
                <Input
                  id="edit-qtyPerUnit"
                  name="qtyPerUnit"
                  type="number"
                  step="0.0001"
                  required
                  defaultValue={String(selectedRow.qty_per_unit)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Recipe</DialogTitle>
          </DialogHeader>
          {selectedRow && (
            <form action={handleDelete} className="space-y-4">
              <input type="hidden" name="id" value={selectedRow.id} />
              <p className="text-sm text-muted-foreground">
                Delete recipe for {selectedRow.product_type}
                {selectedRow.size ? ` (${selectedRow.size})` : ""}?
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={isPending}>
                  {isPending ? "Deleting..." : "Delete"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

