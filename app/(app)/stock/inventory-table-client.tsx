"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, AlertTriangle } from "lucide-react";
import {
  auditSetMaterialQuantityAction,
  consumeMaterialAction,
  createMaterialInventoryAction,
  restockMaterialAction,
  updateMaterialInventoryAction,
} from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { MaterialInventory } from "@/types/stock";
import { Card, CardContent } from "@/components/ui/card";

interface InventoryTableClientProps {
  materials: MaterialInventory[];
  isAdmin: boolean;
  consumedThisMonth: Array<{ material_id: string; delta_qty: number }>;
}

export function InventoryTableClient({ materials, isAdmin, consumedThisMonth }: InventoryTableClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialInventory | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [isConsumeOpen, setIsConsumeOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  
  const [qtyValue, setQtyValue] = useState("");
  const [newQtyValue, setNewQtyValue] = useState("");
  const [referenceValue, setReferenceValue] = useState("");
  const [notesValue, setNotesValue] = useState("");
  const [searchValue, setSearchValue] = useState("");

  const consumedMap = consumedThisMonth.reduce((acc, mov) => {
    const current = acc.get(mov.material_id) ?? 0;
    const qty = Math.abs(Number(mov.delta_qty ?? 0));
    acc.set(mov.material_id, current + qty);
    return acc;
  }, new Map<string, number>());

  const filteredMaterials = materials.filter((m) => {
    if (!searchValue.trim()) return true;
    const q = searchValue.trim().toLowerCase();
    return (m.name || "").toLowerCase().includes(q) || (m.supplier || "").toLowerCase().includes(q) || (m.unit || "").toLowerCase().includes(q);
  });

  function handleAddMaterial(formData: FormData) {
    startTransition(async () => {
      const result = await createMaterialInventoryAction(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Material added");
        setIsAddOpen(false);
        router.refresh();
      }
    });
  }

  function handleEditMaterial(formData: FormData) {
    startTransition(async () => {
        const result = await updateMaterialInventoryAction(formData);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Material updated");
            setIsEditOpen(false);
            router.refresh();
        }
    });
  }

  function resetMovementFields() {
    setQtyValue("");
    setNewQtyValue("");
    setReferenceValue("");
    setNotesValue("");
  }

  function submitRestock() {
    if (!selectedMaterial) return;
    const qty = Number(qtyValue);
    if (!qty || qty <= 0) return;
    const formData = new FormData();
    formData.set("materialId", selectedMaterial.id);
    formData.set("quantity", String(qty));
    if (referenceValue) formData.set("reference", referenceValue);
    if (notesValue) formData.set("notes", notesValue);

    startTransition(async () => {
      const result = await restockMaterialAction(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Restock recorded");
        setIsRestockOpen(false);
        resetMovementFields();
        router.refresh();
      }
    });
  }

  function submitConsume() {
    if (!selectedMaterial) return;
    const qty = Number(qtyValue);
    if (!qty || qty <= 0) return;
    const formData = new FormData();
    formData.set("materialId", selectedMaterial.id);
    formData.set("quantity", String(qty));
    if (referenceValue) formData.set("reference", referenceValue);
    if (notesValue) formData.set("notes", notesValue);

    startTransition(async () => {
      const result = await consumeMaterialAction(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Consumption recorded");
        setIsConsumeOpen(false);
        resetMovementFields();
        router.refresh();
      }
    });
  }

  function submitAudit() {
    if (!selectedMaterial) return;
    const newQty = Number(newQtyValue);
    if (Number.isNaN(newQty) || newQty < 0) return;
    const formData = new FormData();
    formData.set("materialId", selectedMaterial.id);
    formData.set("newQtyOnHand", String(newQty));
    if (referenceValue) formData.set("reference", referenceValue);
    if (notesValue) formData.set("notes", notesValue);

    startTransition(async () => {
      const result = await auditSetMaterialQuantityAction(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Audit adjustment recorded");
        setIsAuditOpen(false);
        resetMovementFields();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Input
          placeholder="Search materials..."
          className="max-w-sm"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
        {isAdmin && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Material
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Material</DialogTitle>
              </DialogHeader>
              <form action={handleAddMaterial} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="unit">Unit (e.g. m, kg)</Label>
                    <Input id="unit" name="unit" required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="qty_on_hand">Initial Qty</Label>
                    <Input id="qty_on_hand" name="qty_on_hand" type="number" step="0.01" defaultValue="0" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="minimum_level">Min Level</Label>
                    <Input id="minimum_level" name="minimum_level" type="number" step="0.01" defaultValue="0" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="restock_threshold">Restock Threshold</Label>
                    <Input id="restock_threshold" name="restock_threshold" type="number" step="0.01" defaultValue="0" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="supplier">Supplier</Label>
                  <Input id="supplier" name="supplier" />
                </div>
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? "Adding..." : "Add Material"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="rounded-md border hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Qty On Hand</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Used This Month</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMaterials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No materials found. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredMaterials.map((material) => {
                const isLowStock = material.qty_on_hand <= material.minimum_level;
                const needsRestock = !isLowStock && material.qty_on_hand <= material.restock_threshold;
                const usedThisMonth = consumedMap.get(material.id) ?? 0;
                return (
                  <TableRow key={material.id}>
                    <TableCell className="font-medium">{material.name}</TableCell>
                    <TableCell>
                      <span className={isLowStock ? "text-destructive font-bold" : ""}>
                        {material.qty_on_hand}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{material.unit}</TableCell>
                    <TableCell>
                      {isLowStock ? (
                        <span className="inline-flex items-center text-xs text-destructive font-medium bg-destructive/10 px-2 py-1 rounded-full">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Low Stock
                        </span>
                      ) : needsRestock ? (
                        <span className="inline-flex items-center text-xs text-yellow-700 font-medium bg-yellow-50 px-2 py-1 rounded-full">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Restock
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded-full">
                          OK
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{usedThisMonth || "—"}</TableCell>
                    <TableCell>{material.supplier || "—"}</TableCell>
                    <TableCell className="text-right">
                      {isAdmin ? (
                        <div className="flex justify-end gap-2 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedMaterial(material);
                              setIsEditOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              setSelectedMaterial(material);
                              setIsRestockOpen(true);
                              resetMovementFields();
                            }}
                          >
                            Restock
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSelectedMaterial(material);
                              setIsConsumeOpen(true);
                              resetMovementFields();
                            }}
                          >
                            Consume
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedMaterial(material);
                              setIsAuditOpen(true);
                              resetMovementFields();
                              setNewQtyValue(String(material.qty_on_hand ?? 0));
                            }}
                          >
                            Audit
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Read-only</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {filteredMaterials.map((material) => {
            const isLowStock = material.qty_on_hand <= material.minimum_level;
            const needsRestock = !isLowStock && material.qty_on_hand <= material.restock_threshold;
            const usedThisMonth = consumedMap.get(material.id) ?? 0;
            return (
                <Card key={material.id}>
                    <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className="font-semibold">{material.name}</h3>
                                <p className="text-sm text-muted-foreground">{material.supplier || "—"}</p>
                            </div>
                            {isLowStock && (
                                <AlertTriangle className="h-5 w-5 text-destructive" />
                            )}
                        </div>
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-2xl font-bold">
                                    {material.qty_on_hand} <span className="text-sm font-normal text-muted-foreground">{material.unit}</span>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Min: {material.minimum_level} · Restock: {material.restock_threshold}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Used this month: {usedThisMonth || "—"} {material.unit}
                                </p>
                                {needsRestock && !isLowStock && (
                                  <p className="text-xs font-medium text-yellow-700">Restock recommended</p>
                                )}
                            </div>
                            {isAdmin ? (
                              <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    onClick={() => {
                                        setSelectedMaterial(material);
                                        setIsRestockOpen(true);
                                        resetMovementFields();
                                    }}
                                >
                                    Restock
                                </Button>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                        setSelectedMaterial(material);
                                        setIsConsumeOpen(true);
                                        resetMovementFields();
                                    }}
                                >
                                    Consume
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Read-only</span>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )
        })}
      </div>

      {/* Restock Dialog */}
      <Dialog open={isRestockOpen} onOpenChange={setIsRestockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restock {selectedMaterial?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Quantity to Add</Label>
              <Input
                type="number"
                step="0.01"
                value={qtyValue}
                onChange={(e) => setQtyValue(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label>Reference</Label>
              <Input value={referenceValue} onChange={(e) => setReferenceValue(e.target.value)} placeholder="Optional reference..." />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Input
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRestockOpen(false)}>Cancel</Button>
            <Button onClick={submitRestock} disabled={isPending}>
              {isPending ? "Saving..." : "Confirm Restock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isConsumeOpen} onOpenChange={setIsConsumeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consume {selectedMaterial?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Quantity to Consume</Label>
              <Input type="number" step="0.01" value={qtyValue} onChange={(e) => setQtyValue(e.target.value)} placeholder="0.00" />
            </div>
            <div className="grid gap-2">
              <Label>Reference</Label>
              <Input value={referenceValue} onChange={(e) => setReferenceValue(e.target.value)} placeholder="Optional reference..." />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Input value={notesValue} onChange={(e) => setNotesValue(e.target.value)} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConsumeOpen(false)}>Cancel</Button>
            <Button onClick={submitConsume} disabled={isPending}>
              {isPending ? "Saving..." : "Confirm Consume"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAuditOpen} onOpenChange={setIsAuditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Audit Adjustment {selectedMaterial?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>New Qty On Hand</Label>
              <Input type="number" step="0.01" value={newQtyValue} onChange={(e) => setNewQtyValue(e.target.value)} placeholder="0.00" />
            </div>
            <div className="grid gap-2">
              <Label>Reference</Label>
              <Input value={referenceValue} onChange={(e) => setReferenceValue(e.target.value)} placeholder="Optional reference..." />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Input value={notesValue} onChange={(e) => setNotesValue(e.target.value)} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAuditOpen(false)}>Cancel</Button>
            <Button onClick={submitAudit} disabled={isPending}>
              {isPending ? "Saving..." : "Confirm Audit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Edit {selectedMaterial?.name}</DialogTitle>
            </DialogHeader>
            {selectedMaterial && (
                <form action={handleEditMaterial} className="space-y-4">
                    <input type="hidden" name="id" value={selectedMaterial.id} />
                    <div className="grid gap-2">
                        <Label htmlFor="edit-name">Name</Label>
                        <Input id="edit-name" name="name" defaultValue={selectedMaterial.name} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-unit">Unit</Label>
                            <Input id="edit-unit" name="unit" defaultValue={selectedMaterial.unit} required />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-supplier">Supplier</Label>
                            <Input id="edit-supplier" name="supplier" defaultValue={selectedMaterial.supplier || ""} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-min">Min Level</Label>
                            <Input id="edit-min" name="minimum_level" type="number" step="0.01" defaultValue={selectedMaterial.minimum_level} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-threshold">Restock Threshold</Label>
                            <Input id="edit-threshold" name="restock_threshold" type="number" step="0.01" defaultValue={selectedMaterial.restock_threshold} />
                        </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={isPending}>
                        {isPending ? "Saving..." : "Save Changes"}
                    </Button>
                </form>
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
