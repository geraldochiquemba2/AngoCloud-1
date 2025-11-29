import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import { motion } from "framer-motion";
import adminBgImage from "@/assets/pexels-steve-29586678_1764345410863.jpg";
import LoadingScreen from "@/components/LoadingScreen";
import { 
  ArrowLeft, 
  Users, 
  Crown, 
  Shield, 
  ShieldCheck, 
  Check, 
  X, 
  Clock, 
  HardDrive,
  Upload,
  Mail,
  Calendar,
  Search,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface AdminUser {
  id: string;
  email: string;
  nome: string;
  plano: string;
  storageLimit: number;
  storageUsed: number;
  uploadsCount: number;
  uploadLimit: number;
  isAdmin: boolean;
  createdAt: string;
}

interface UpgradeRequest {
  id: string;
  userId: string;
  currentPlan: string;
  requestedPlan: string;
  requestedExtraGB?: number;
  totalPrice?: number;
  status: string;
  adminNote?: string;
  proofFileName?: string;
  proofFileSize?: number;
  proofTelegramFileId?: string;
  proofTelegramBotId?: string;
  createdAt: string;
  userName: string;
  userEmail: string;
}

const PLANS = {
  gratis: { name: "Grátis", color: "bg-gray-500", textColor: "text-gray-400" },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequest[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectingRequest, setRejectingRequest] = useState<UpgradeRequest | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [showLoading, setShowLoading] = useState(true);

  // WebSocket connection for real-time admin updates
  const { on: wsOn } = useWebSocket(user?.id, true);

  useEffect(() => {
    if (!loading && (!user || !user.isAdmin)) {
      setLocation("/dashboard");
    }
  }, [user, loading, setLocation]);

  useEffect(() => {
    if (user?.isAdmin) {
      setShowLoading(true);
      const startTime = Date.now();
      fetchData().then(() => {
        // Ensure loading lasts at least 3 seconds
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, 3000 - elapsedTime);
        setTimeout(() => setShowLoading(false), remainingTime);
      });
    }
  }, [user]);

  // WebSocket event listeners for admin notifications
  useEffect(() => {
    if (!user?.isAdmin) return;

    const unsubscribeNewRequest = wsOn("new_upgrade_request", (msg) => {
      const newRequest = msg.data as UpgradeRequest;
      setUpgradeRequests(prev => {
        if (prev.some(r => r.id === newRequest.id)) return prev;
        toast({
          title: "Novo Pedido",
          description: `${newRequest.userName} solicitou ${newRequest.requestedExtraGB}GB extra`,
        });
        return [newRequest, ...prev];
      });
    });

    const unsubscribeRequestUpdated = wsOn("upgrade_request_updated", (msg) => {
      const updatedRequest = msg.data as UpgradeRequest;
      setUpgradeRequests(prev => prev.map(r => r.id === updatedRequest.id ? updatedRequest : r));
    });

    return () => {
      unsubscribeNewRequest();
      unsubscribeRequestUpdated();
    };
  }, [user?.isAdmin, wsOn, toast]);

  const fetchData = async () => {
    setLoadingData(true);
    try {
      const [usersRes, requestsRes] = await Promise.all([
        fetch("/api/admin/users", { credentials: "include" }),
        fetch("/api/admin/upgrade-requests", { credentials: "include" }),
      ]);
      
      if (usersRes.ok) {
        setUsers(await usersRes.json());
      }
      if (requestsRes.ok) {
        setUpgradeRequests(await requestsRes.json());
      }
    } catch (error) {
      console.error("Error fetching admin data:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados de administração",
        variant: "destructive",
      });
    } finally {
      setLoadingData(false);
    }
  };

  const handleAdminToggle = async (userId: string, isAdmin: boolean) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isAdmin }),
      });

      if (response.ok) {
        toast({ 
          title: "Sucesso", 
          description: isAdmin ? "Administrador adicionado" : "Administrador removido" 
        });
        fetchData();
      } else {
        const data = await response.json();
        toast({ title: "Erro", description: data.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Erro ao atualizar administrador", variant: "destructive" });
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    setProcessingRequest(requestId);
    try {
      const response = await fetch(`/api/admin/upgrade-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "approved" }),
      });

      if (response.ok) {
        toast({ title: "Sucesso", description: "Solicitação aprovada" });
        fetchData();
      } else {
        const data = await response.json();
        toast({ title: "Erro", description: data.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Erro ao aprovar solicitação", variant: "destructive" });
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleRejectRequest = async () => {
    if (!rejectingRequest) return;
    
    setProcessingRequest(rejectingRequest.id);
    try {
      const response = await fetch(`/api/admin/upgrade-requests/${rejectingRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "rejected", adminNote: rejectNote }),
      });

      if (response.ok) {
        toast({ title: "Sucesso", description: "Solicitação rejeitada" });
        setShowRejectDialog(false);
        setRejectingRequest(null);
        setRejectNote("");
        fetchData();
      } else {
        const data = await response.json();
        toast({ title: "Erro", description: data.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Erro ao rejeitar solicitação", variant: "destructive" });
    } finally {
      setProcessingRequest(null);
    }
  };

  const openRejectDialog = (request: UpgradeRequest) => {
    setRejectingRequest(request);
    setRejectNote("");
    setShowRejectDialog(true);
  };

  if (loading || !user?.isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent"
        />
      </div>
    );
  }

  const pendingRequests = upgradeRequests.filter(r => r.status === "pending");
  const processedRequests = upgradeRequests.filter(r => r.status !== "pending");
  const totalStorage = users.reduce((acc, u) => acc + u.storageUsed, 0);
  const totalUploads = users.reduce((acc, u) => acc + u.uploadsCount, 0);
  
  const totalUsers = users.length;

  return (
    <>
      <LoadingScreen isVisible={showLoading} />
      <div 
        className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900"
        style={{
          backgroundImage: `url(${adminBgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      >
      <header className="bg-black/30 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/dashboard")}
                className="text-white/70 hover:text-white"
                data-testid="button-back-dashboard"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
              <div className="flex items-center gap-2">
                <Shield className="w-6 h-6 text-amber-500" />
                <h1 className="text-xl font-bold text-white">Painel de Administração</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="backdrop-blur-md bg-white/10 border border-white/30">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Users className="w-8 h-8 text-blue-400" />
                  <div>
                    <p className="text-sm text-white/60">Total de Utilizadores</p>
                    <p className="text-2xl font-bold text-white" data-testid="text-total-users">{users.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="backdrop-blur-md bg-white/10 border border-white/30">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <HardDrive className="w-8 h-8 text-green-400" />
                  <div>
                    <p className="text-sm text-white/60">Armazenamento Total</p>
                    <p className="text-2xl font-bold text-white" data-testid="text-total-storage">{formatBytes(totalStorage)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="backdrop-blur-md bg-white/10 border border-white/30">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Upload className="w-8 h-8 text-purple-400" />
                  <div>
                    <p className="text-sm text-white/60">Total de Uploads</p>
                    <p className="text-2xl font-bold text-white" data-testid="text-total-uploads">{totalUploads}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="backdrop-blur-md bg-white/10 border border-white/30">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Clock className="w-8 h-8 text-amber-400" />
                  <div>
                    <p className="text-sm text-white/60">Solicitações Pendentes</p>
                    <p className="text-2xl font-bold text-white" data-testid="text-pending-requests">{pendingRequests.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Pending Upgrade Requests Alert */}
          {pendingRequests.length > 0 && (
            <Card className="backdrop-blur-md bg-amber-500/10 border border-amber-500/30 mb-8">
              <CardHeader>
                <CardTitle className="text-amber-400 flex items-center gap-2">
                  <Clock className="w-5 h-5 animate-pulse" />
                  {pendingRequests.length} Solicitação(ões) de Armazenamento Pendente(s)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingRequests.map((req) => (
                    <div 
                      key={req.id}
                      className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10"
                      data-testid={`pending-request-${req.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                          <Crown className="w-5 h-5 text-amber-500" />
                        </div>
                        <div>
                          <p className="text-white font-medium">{req.userName}</p>
                          <p className="text-white/50 text-sm">{req.userEmail}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {typeof req.requestedExtraGB === 'number' && req.requestedExtraGB > 0 && (
                              <Badge className="bg-emerald-500 text-white" data-testid={`badge-extra-gb-${req.id}`}>
                                +{req.requestedExtraGB} GB = {req.totalPrice || req.requestedExtraGB * 500} Kz
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="bg-green-500 hover:bg-green-600"
                          onClick={() => handleApproveRequest(req.id)}
                          disabled={processingRequest === req.id}
                          data-testid={`button-quick-approve-${req.id}`}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => openRejectDialog(req)}
                          disabled={processingRequest === req.id}
                          className="text-white"
                          data-testid={`button-quick-reject-${req.id}`}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Rejeitar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="users" className="space-y-6">
            <TabsList className="bg-black/30 border border-white/10">
              <TabsTrigger value="users" className="data-[state=active]:bg-white/10 text-white">
                <Users className="w-4 h-4 mr-2" />
                Utilizadores
              </TabsTrigger>
              <TabsTrigger value="requests" className="data-[state=active]:bg-white/10 text-white">
                <Crown className="w-4 h-4 mr-2" />
                Armazenamento Extra
                {pendingRequests.length > 0 && (
                  <Badge variant="destructive" className="ml-2">{pendingRequests.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users">
              <Card className="backdrop-blur-md bg-white/10 border border-white/30">
                <CardHeader>
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Gestão de Utilizadores
                      </CardTitle>
                      <CardDescription className="text-white/60">
                        Visualize e gerencie todos os utilizadores do sistema
                      </CardDescription>
                    </div>
                    <div className="relative w-full md:w-64">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/50" />
                      <input
                        type="text"
                        placeholder="Buscar por nome ou email..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-primary/50"
                        data-testid="input-search-users"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingData ? (
                    <div className="flex justify-center py-8">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent"
                      />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/10 hover:bg-white/5">
                            <TableHead className="text-white/70">Utilizador</TableHead>
                            <TableHead className="text-white/70">Armazenamento Usado</TableHead>
                            <TableHead className="text-white/70">Limite</TableHead>
                            <TableHead className="text-white/70">Admin</TableHead>
                            <TableHead className="text-white/70">Data</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users
                            .filter((u) => {
                              if (!userSearchQuery.trim()) return true;
                              const query = userSearchQuery.toLowerCase();
                              return u.nome.toLowerCase().includes(query) || u.email.toLowerCase().includes(query);
                            })
                            .map((u) => (
                            <TableRow 
                              key={u.id} 
                              className="border-white/10 hover:bg-white/5"
                              data-testid={`row-user-${u.id}`}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Mail className="w-4 h-4 text-white/50" />
                                  <div>
                                    <p className="text-white font-medium">{u.nome}</p>
                                    <p className="text-white/50 text-sm">{u.email}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-white">
                                  <span className="font-medium">{formatBytes(u.storageUsed)}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-white text-sm">
                                  <span className="font-medium">{formatBytes(u.storageLimit)}</span>
                                  <span className="text-white/50"> (20GB grátis + extras)</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant={u.isAdmin ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => handleAdminToggle(u.id, !u.isAdmin)}
                                  disabled={u.id === user.id}
                                  className={u.isAdmin ? "bg-amber-500 hover:bg-amber-600" : "border-white/20 text-white/70"}
                                  data-testid={`button-admin-${u.id}`}
                                >
                                  {u.isAdmin ? (
                                    <>
                                      <ShieldCheck className="w-4 h-4 mr-1" />
                                      Admin
                                    </>
                                  ) : (
                                    <>
                                      <Shield className="w-4 h-4 mr-1" />
                                      User
                                    </>
                                  )}
                                </Button>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1 text-white/50">
                                  <Calendar className="w-4 h-4" />
                                  {u.createdAt ? formatDate(u.createdAt) : "N/A"}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="requests">
              <div className="space-y-6">
                {pendingRequests.length > 0 && (
                  <Card className="backdrop-blur-md bg-amber-500/10 border border-amber-500/30">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Clock className="w-5 h-5 text-amber-500" />
                        Solicitações Pendentes
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {pendingRequests.map((req) => (
                          <div 
                            key={req.id}
                            className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10"
                            data-testid={`request-${req.id}`}
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                                <Crown className="w-5 h-5 text-amber-500" />
                              </div>
                              <div>
                                <p className="text-white font-medium">{req.userName}</p>
                                <p className="text-white/50 text-sm">{req.userEmail}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {typeof req.requestedExtraGB === 'number' && req.requestedExtraGB > 0 && (
                                    <Badge className="bg-emerald-500 text-white" data-testid={`badge-tab-extra-gb-${req.id}`}>
                                      +{req.requestedExtraGB} GB = {req.totalPrice || req.requestedExtraGB * 500} Kz
                                    </Badge>
                                  )}
                                </div>
                                {req.proofFileName && (
                                  <p className="text-white/40 text-xs mt-1">
                                    Comprovativo: {req.proofFileName}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {req.proofTelegramFileId && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                                  onClick={() => window.open(`/api/admin/upgrade-requests/${req.id}/proof`, '_blank')}
                                  data-testid={`button-view-proof-${req.id}`}
                                >
                                  <FileText className="w-4 h-4 mr-1" />
                                  Ver Comprovativo
                                </Button>
                              )}
                              <Button
                                size="sm"
                                className="bg-green-500 hover:bg-green-600"
                                onClick={() => handleApproveRequest(req.id)}
                                disabled={processingRequest === req.id}
                                data-testid={`button-approve-${req.id}`}
                              >
                                <Check className="w-4 h-4 mr-1" />
                                Aprovar
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => openRejectDialog(req)}
                                disabled={processingRequest === req.id}
                                className="text-white"
                                data-testid={`button-reject-${req.id}`}
                              >
                                <X className="w-4 h-4 mr-1" />
                                Rejeitar
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="backdrop-blur-md bg-white/10 border border-white/30">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Crown className="w-5 h-5" />
                      Histórico de Solicitações
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {processedRequests.length === 0 ? (
                      <p className="text-white/50 text-center py-8">Nenhuma solicitação processada</p>
                    ) : (
                      <div className="space-y-3">
                        {processedRequests.map((req) => (
                          <div 
                            key={req.id}
                            className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${
                                req.status === "approved" ? "bg-green-500" : "bg-red-500"
                              }`} />
                              <div>
                                <p className="text-white text-sm">{req.userName}</p>
                                <p className="text-white/40 text-xs">
                                  {typeof req.requestedExtraGB === 'number' && req.requestedExtraGB > 0 && (
                                    <span className="text-emerald-400">
                                      +{req.requestedExtraGB} GB = {req.totalPrice || req.requestedExtraGB * 500} Kz
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <Badge variant={req.status === "approved" ? "default" : "destructive"}>
                              {req.status === "approved" ? "Aprovado" : "Rejeitado"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="backdrop-blur-md bg-white/10 border border-white/30">
          <DialogHeader>
            <DialogTitle className="text-white">Rejeitar Solicitação</DialogTitle>
            <DialogDescription className="text-white/60">
              Adicione uma nota explicando o motivo da rejeição (opcional)
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Motivo da rejeição..."
            className="bg-white/5 border-white/10 text-white"
            data-testid="input-reject-note"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRejectDialog(false)}
              className="border-white/20 text-white"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectRequest}
              disabled={processingRequest !== null}
              className="text-white"
              data-testid="button-confirm-reject"
            >
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </>
  );
}
