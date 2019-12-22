from typing import *

from pydgraph import DgraphClient

from grapl_analyzerlib.nodes.comparators import (
    Cmp,
    IntCmp,
    _int_cmps,
    StrCmp,
    _str_cmps,
    PropertyFilter,
)

from grapl_analyzerlib.nodes.queryable import NQ, Queryable
from grapl_analyzerlib.nodes.types import PropertyT, Property
from grapl_analyzerlib.nodes.viewable import EdgeViewT, ForwardEdgeView, Viewable

IProcessOutboundNetworkConnectionQuery = TypeVar(
    "IProcessOutboundNetworkConnectionQuery",
    bound="ProcessOutboundNetworkConnectionQuery",
)


class ProcessOutboundNetworkConnectionQuery(Queryable):
    def __init__(self):
        super(ProcessOutboundNetworkConnectionQuery, self).__init__(
            ProcessOutboundNetworkConnectionView
        )
        self._created_timestamp = []  # type: List[List[Cmp[int]]]
        self._terminated_timestamp = []  # type: List[List[Cmp[int]]]
        self._last_seen_timestamp = []  # type: List[List[Cmp[int]]]
        self._port = []  # type: List[List[Cmp[int]]]
        self._ip_address = []  # type: List[List[Cmp[str]]]
        self._protocol = []  # type: List[List[Cmp[str]]]

        self._connected_over = None  # type: Optional[IIpPortQuery]

        # Reverse edge
        self._connecting_processes = None  # type: Optional[IProcessQuery]

    def with_ip_address(
        self,
        eq: Optional[StrCmp] = None,
        contains: Optional[StrCmp] = None,
        ends_with: Optional[StrCmp] = None,
        starts_with: Optional[StrCmp] = None,
        regexp: Optional[StrCmp] = None,
        distance: Optional[Tuple[StrCmp, int]] = None,
    ) -> "NQ":
        self.set_str_property_filter(
            "ip_address",
            _str_cmps(
                "ip_address",
                eq=eq,
                contains=contains,
                ends_with=ends_with,
                starts_with=starts_with,
                regexp=regexp,
                distance=distance,
            ),
        )
        return self

    def with_protocol(
        self,
        eq: Optional[StrCmp] = None,
        contains: Optional[StrCmp] = None,
        ends_with: Optional[StrCmp] = None,
        starts_with: Optional[StrCmp] = None,
        regexp: Optional[StrCmp] = None,
        distance: Optional[Tuple[StrCmp, int]] = None,
    ) -> "NQ":
        self.set_str_property_filter(
            "protocol",
            _str_cmps(
                "protocol",
                eq=eq,
                contains=contains,
                ends_with=ends_with,
                starts_with=starts_with,
                regexp=regexp,
                distance=distance,
            ),
        )
        return self

    def with_created_timestamp(
        self: "NQ",
        eq: Optional["IntCmp"] = None,
        gt: Optional["IntCmp"] = None,
        lt: Optional["IntCmp"] = None,
    ) -> "NQ":
        self.set_int_property_filter(
            "created_timestamp", _int_cmps("created_timestamp", eq=eq, gt=gt, lt=lt)
        )
        return self

    def with_terminated_timestamp(
        self: "NQ",
        eq: Optional["IntCmp"] = None,
        gt: Optional["IntCmp"] = None,
        lt: Optional["IntCmp"] = None,
    ) -> "NQ":
        self.set_int_property_filter(
            "terminated_timestamp",
            _int_cmps("terminated_timestamp", eq=eq, gt=gt, lt=lt),
        )
        return self

    def with_last_seen_timestamp(
        self: "NQ",
        eq: Optional["IntCmp"] = None,
        gt: Optional["IntCmp"] = None,
        lt: Optional["IntCmp"] = None,
    ) -> "NQ":
        self.set_int_property_filter(
            "last_seen_timestamp", _int_cmps("last_seen_timestamp", eq=eq, gt=gt, lt=lt)
        )
        return self

    def with_port(
        self: "NQ",
        eq: Optional["IntCmp"] = None,
        gt: Optional["IntCmp"] = None,
        lt: Optional["IntCmp"] = None,
    ) -> "NQ":
        self.set_int_property_filter("port", _int_cmps("port", eq=eq, gt=gt, lt=lt))
        return self

    def with_connecting_processess(
        self: "NQ", connecting_processess_query: Optional["ProcessQuery"] = None
    ) -> "NQ":
        connecting_processess = connecting_processess_query or IpPortQuery()
        connecting_processess._created_connections = self

        cast(
            ProcessOutboundNetworkConnectionQuery, self
        )._connecting_processes = connecting_processess

        return self

    def with_connected_over(
        self: "NQ", connected_over_query: Optional["IpPortQuery"] = None
    ) -> "NQ":
        connected_over = connected_over_query or IpPortQuery()

        self.set_forward_edge_filter("connected_over", connected_over)
        connected_over.set_reverse_edge_filter(
            "~connected_over", self, "connected_over"
        )
        return self

    def _get_unique_predicate(self) -> Optional[Tuple[str, "PropertyT"]]:
        return None

    def _get_node_type_name(self) -> Optional[str]:
        return "ProcessOutboundNetworkConnection"

    def _get_property_filters(self) -> Mapping[str, "PropertyFilter[Property]"]:
        props = {
            "created_timestamp": self._created_timestamp,
            "terminated_timestamp": self._terminated_timestamp,
            "last_seen_timestamp": self._last_seen_timestamp,
            "port": self._port,
            "ip_address": self._ip_address,
            "protocol": self._protocol,
        }

        combined = {}
        for prop_name, prop_filter in props.items():
            if prop_filter:
                combined[prop_name] = cast(PropertyFilter[Property], prop_filter)

        return combined

    def _get_forward_edges(self) -> Mapping[str, "Queryable"]:
        forward_edges = {"connected_over": self._connected_over}

        return {fe[0]: fe[1] for fe in forward_edges.items() if fe[1] is not None}

    def _get_reverse_edges(self) -> Mapping[str, Tuple["Queryable", str]]:
        reverse_edges = {
            "~created_connections": (self._connecting_processes, "connecting_processes")
        }

        return {
            fe[0]: (fe[1][0], fe[1][1])
            for fe in reverse_edges.items()
            if fe[1][0] is not None
        }


IProcessOutboundNetworkConnectionView = TypeVar(
    "IProcessOutboundNetworkConnectionView",
    bound="ProcessOutboundNetworkConnectionView",
)


class ProcessOutboundNetworkConnectionView(Viewable):
    def __init__(
        self,
        dgraph_client: DgraphClient,
        node_key: str,
        uid: str,
        node_type: str,
        created_timestamp: Optional[int] = None,
        terminated_timestamp: Optional[int] = None,
        last_seen_timestamp: Optional[int] = None,
        port: Optional[int] = None,
        ip_address: Optional[str] = None,
        protocol: Optional[str] = None,
        connecting_processes: "Optional[IProcessView]" = None,
        connected_over: "Optional[IpPortView]" = None,
    ):
        super(ProcessOutboundNetworkConnectionView, self).__init__(
            dgraph_client=dgraph_client, node_key=node_key, uid=uid, node_type=node_type
        )
        self.dgraph_client = dgraph_client
        self.node_key = node_key
        self.uid = uid
        self.node_type = node_type

        self.created_timestamp = created_timestamp
        self.terminated_timestamp = terminated_timestamp
        self.last_seen_timestamp = last_seen_timestamp
        self.port = port
        self.ip_address = ip_address
        self.protocol = protocol
        self.connecting_processes = connecting_processes
        self.connected_over = connected_over

    def get_created_timestamp(self) -> Optional[int]:
        if not self.created_timestamp:
            self.created_timestamp = cast(
                Optional[int], self.fetch_property("created_timestamp", int)
            )
        return self.created_timestamp

    def get_terminated_timestamp(self) -> Optional[int]:
        if not self.terminated_timestamp:
            self.terminated_timestamp = cast(
                Optional[int], self.fetch_property("terminated_timestamp", int)
            )
        return self.terminated_timestamp

    def get_last_seen_timestamp(self) -> Optional[int]:
        if not self.last_seen_timestamp:
            self.last_seen_timestamp = cast(
                Optional[int], self.fetch_property("last_seen_timestamp", int)
            )
        return self.last_seen_timestamp

    def get_port(self) -> Optional[int]:
        if not self.port:
            self.port = cast(Optional[int], self.fetch_property("port", int))
        return self.port

    def get_ip_address(self) -> Optional[str]:
        if not self.ip_address:
            self.ip_address = cast(
                Optional[str], self.fetch_property("ip_address", str)
            )
        return self.ip_address

    def get_protocol(self) -> Optional[str]:
        if not self.protocol:
            self.protocol = cast(Optional[str], self.fetch_property("protocol", str))
        return self.protocol

    def get_connecting_processes(self):
        return cast(
            List[ProcessOutboundNetworkConnectionView],
            self.fetch_edges(
                "~created_connections", ProcessOutboundNetworkConnectionView
            ),
        )

    @staticmethod
    def _get_property_types() -> Mapping[str, "PropertyT"]:
        return {
            "created_timestamp": int,
            "terminated_timestamp": int,
            "last_seen_timestamp": int,
            "port": int,
            "ip_address": str,
            "protocol": str,
        }

    @staticmethod
    def _get_forward_edge_types() -> Mapping[str, "EdgeViewT"]:
        f_edges = {
            "connected_over": IpPortView
        }  # type: Dict[str, Optional["EdgeViewT"]]

        return cast(
            Mapping[str, "EdgeViewT"], {fe[0]: fe[1] for fe in f_edges.items() if fe[1]}
        )

    def _get_forward_edges(self) -> "Mapping[str, ForwardEdgeView]":
        f_edges = {
            "connected_over": self.connected_over
        }  # type: Dict[str, Optional[ForwardEdgeView]]

        return cast(
            Mapping[str, ForwardEdgeView],
            {fe[0]: fe[1] for fe in f_edges.items() if fe[1]},
        )

    def _get_properties(self, fetch: bool = False) -> Mapping[str, Union[str, int]]:
        props = {
            "created_timestamp": self.created_timestamp,
            "terminated_timestamp": self.terminated_timestamp,
            "last_seen_timestamp": self.last_seen_timestamp,
            "port": self.port,
            "ip_address": self.ip_address,
            "protocol": self.protocol,
        }

        return {p[0]: p[1] for p in props.items() if p[1] is not None}

    @staticmethod
    def _get_reverse_edge_types() -> Mapping[str, Tuple["EdgeViewT", str]]:
        return {"~created_connections": ([ProcessView], "connecting_processes")}

    def _get_reverse_edges(self) -> Mapping[str, Tuple["Queryable", str]]:
        reverse_edges = {
            "~created_connections": (self.connecting_processes, "connecting_processes")
        }

        return {
            fe[0]: (fe[1][0], fe[1][1])
            for fe in reverse_edges.items()
            if fe[1][0] is not None
        }


from grapl_analyzerlib.nodes.ip_port_node import IpPortView, IpPortQuery, IIpPortQuery

from grapl_analyzerlib.nodes.process_node import (
    IProcessQuery,
    ProcessQuery,
    ProcessView,
    IProcessView,
)
